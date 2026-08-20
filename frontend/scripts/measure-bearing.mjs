// Quanto sbaglia l'orientamento del mezzo, e dove sbaglia di piu'.
//
// La direzione oggi si misura fra il punto 40 m indietro e quello 40 m avanti:
// una corda di 80 metri. Su un rettilineo digitalizzato a passo grosso e' la
// scelta giusta - ignora i vertici e segue la strada. **Su una rotonda no**:
// una rotonda torinese misura 30-50 m di diametro, quindi quella corda va
// dall'ingresso all'uscita e la direzione che ne esce punta attraverso
// l'aiuola, non lungo la carreggiata. Il mezzo resta orientato uguale mentre
// gira, ed e' esattamente quello che si vede sulla mappa.
//
// Qui si misura l'errore contro la tangente vera, separando i tratti dritti
// dalle curve strette, e si confrontano le basi alternative.
//
//   node scripts/measure-bearing.mjs
import fs from 'node:fs';

const network = JSON.parse(fs.readFileSync('public/assets/gtfs-network.json', 'utf8'));

const R = 6371000;
const toRad = (value) => (value * Math.PI) / 180;
const toDeg = (value) => (value * 180) / Math.PI;

function distance(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function angleDelta(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function interpolate(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

function measure(path) {
  const lengths = path.slice(0, -1).map((point, index) => distance(point, path[index + 1]));
  return { lengths, total: lengths.reduce((sum, value) => sum + value, 0) };
}

function pointAt(path, lengths, target) {
  let remaining = Math.max(0, target);
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] === 0 ? 0 : Math.min(1, remaining / lengths[index]);
      return interpolate(path[index], path[index + 1], t);
    }
    remaining -= lengths[index];
  }
  return path[path.length - 1];
}

// La direzione con una base data: il punto dietro e quello avanti.
function bearingWithBaseline(path, lengths, total, at, baseline) {
  const behind = pointAt(path, lengths, Math.max(0, at - baseline));
  const ahead = pointAt(path, lengths, Math.min(total, at + baseline));
  return distance(behind, ahead) > 1 ? bearing(behind, ahead) : undefined;
}

// Quanto la strada gira dentro una finestra: la somma dei cambi di direzione
// fra campioni ravvicinati. Su una rotonda supera abbondantemente i 90 gradi.
function turnWithin(path, lengths, total, at, half) {
  const step = 5;
  let previous;
  let sum = 0;
  for (let offset = -half; offset <= half; offset += step) {
    const a = pointAt(path, lengths, Math.max(0, Math.min(total, at + offset)));
    const b = pointAt(path, lengths, Math.max(0, Math.min(total, at + offset + step)));
    if (distance(a, b) < 0.5) continue;
    const heading = bearing(a, b);
    if (previous != null) sum += angleDelta(heading, previous);
    previous = heading;
  }
  return sum;
}

// La tangente vera nel punto: una corda corta, che su una curva stretta e'
// l'unica che segue davvero la carreggiata.
const TRUE_BASELINE = 6;

const straight = { current: [], short: [], adaptive: [], smooth: [] };
const curved = { current: [], short: [], adaptive: [], smooth: [] };
let sampled = 0;
let curvedSamples = 0;

// La base adattiva: si accorcia quando la strada gira molto nella finestra,
// perche' li' una corda lunga taglia la curva invece di seguirla.
//
// A gradini no: quando `turn` attraversa una soglia la base salta, e con lei
// la direzione - un mezzo che entra in rotonda darebbe uno scatto proprio nel
// punto che stiamo cercando di sistemare. La transizione e' quindi continua.
function adaptiveBaseline(turn) {
  if (turn >= 120) return 8;
  if (turn >= 60) return 16;
  if (turn >= 30) return 26;
  return 40;
}

const BASELINE_LONG = 40;
const BASELINE_SHORT = 9;
const TURN_STRAIGHT = 25;
const TURN_TIGHT = 130;

function smoothBaseline(turn) {
  if (turn <= TURN_STRAIGHT) return BASELINE_LONG;
  if (turn >= TURN_TIGHT) return BASELINE_SHORT;
  const share = (turn - TURN_STRAIGHT) / (TURN_TIGHT - TURN_STRAIGHT);
  return BASELINE_LONG + (BASELINE_SHORT - BASELINE_LONG) * share;
}

for (const route of network.routes) {
  const path = route.path;
  if (!path || path.length < 3) continue;
  const { lengths, total } = measure(path);
  if (total < 200) continue;
  for (let at = 40; at < total - 40; at += 25) {
    const truth = bearingWithBaseline(path, lengths, total, at, TRUE_BASELINE);
    if (truth == null) continue;
    const turn = turnWithin(path, lengths, total, at, 40);
    const current = bearingWithBaseline(path, lengths, total, at, 40);
    const short = bearingWithBaseline(path, lengths, total, at, 12);
    const adaptive = bearingWithBaseline(path, lengths, total, at, adaptiveBaseline(turn));
    const smooth = bearingWithBaseline(path, lengths, total, at, smoothBaseline(turn));
    if (current == null || short == null || adaptive == null || smooth == null) continue;
    const bucket = turn >= 90 ? curved : straight;
    bucket.current.push(angleDelta(current, truth));
    bucket.short.push(angleDelta(short, truth));
    bucket.adaptive.push(angleDelta(adaptive, truth));
    bucket.smooth.push(angleDelta(smooth, truth));
    sampled += 1;
    if (turn >= 90) curvedSamples += 1;
  }
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0;
  const over = (limit) => (sorted.filter((value) => value > limit).length / sorted.length) * 100;
  return {
    median: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    over45: over(45),
    over90: over(90),
  };
}

function row(name, values) {
  const s = summary(values);
  console.log(
    name.padEnd(26),
    `${s.median.toFixed(1)}°`.padStart(9),
    `${s.p95.toFixed(1)}°`.padStart(9),
    `${s.p99.toFixed(1)}°`.padStart(9),
    `${s.over45.toFixed(1)}%`.padStart(10),
    `${s.over90.toFixed(2)}%`.padStart(10),
  );
}

// **La seconda meta' della misura, senza la quale la prima inganna.**
// La base di 40 m non esisteva per essere accurata: esisteva per togliere gli
// scatti. Le shape GTT zigzagano fra un vertice e l'altro, e una corda corta
// segue anche quello: la freccia ruota a ogni vertice attraversato e sulla
// mappa si legge come un orientamento casuale. Qui si misura quanto ruota la
// direzione fra due posizioni distanti dieci metri - su un rettilineo dovrebbe
// essere quasi zero, in rotonda ruotare e' giusto perche' il mezzo sta girando.
const jitterStraight = { current: [], short: [], adaptive: [], smooth: [] };
const jitterCurved = { current: [], short: [], adaptive: [], smooth: [] };

for (const route of network.routes) {
  const path = route.path;
  if (!path || path.length < 3) continue;
  const { lengths, total } = measure(path);
  if (total < 200) continue;
  for (let at = 40; at < total - 50; at += 10) {
    const turn = turnWithin(path, lengths, total, at, 40);
    const bucket = turn >= 90 ? jitterCurved : jitterStraight;
    for (const [name, baselineAt] of [
      ['current', () => 40],
      ['short', () => 12],
      ['adaptive', () => adaptiveBaseline(turn)],
      ['smooth', () => smoothBaseline(turn)],
    ]) {
      const here = bearingWithBaseline(path, lengths, total, at, baselineAt());
      const next = bearingWithBaseline(path, lengths, total, at + 10, baselineAt());
      if (here == null || next == null) continue;
      bucket[name].push(angleDelta(here, next));
    }
  }
}

console.log(`campioni: ${sampled} · di cui in curva stretta (oltre 90° in 80 m): ${curvedSamples}`);
console.log(`\nerrore rispetto alla tangente vera (corda di ${TRUE_BASELINE} m)\n`);
console.log('base'.padEnd(26), 'mediana'.padStart(9), 'p95'.padStart(9), 'p99'.padStart(9), 'oltre 45°'.padStart(10), 'oltre 90°'.padStart(10));
console.log('--- tratti scorrevoli ---');
row('40 m (in uso)', straight.current);
row('12 m', straight.short);
row('adattiva a gradini', straight.adaptive);
row('adattiva continua', straight.smooth);
console.log('--- curve strette: rotonde ---');
row('40 m (in uso)', curved.current);
row('12 m', curved.short);
row('adattiva a gradini', curved.adaptive);
row('adattiva continua', curved.smooth);

console.log(`\nrotazione della freccia fra due punti a dieci metri (piu' basso = piu' stabile)\n`);
console.log('base'.padEnd(26), 'mediana'.padStart(9), 'p95'.padStart(9), 'p99'.padStart(9), 'oltre 45°'.padStart(10), 'oltre 90°'.padStart(10));
console.log('--- tratti scorrevoli: qui gli scatti sono difetti ---');
row('40 m (in uso)', jitterStraight.current);
row('12 m', jitterStraight.short);
row('adattiva a gradini', jitterStraight.adaptive);
row('adattiva continua', jitterStraight.smooth);
console.log('--- curve strette: qui ruotare e\' giusto ---');
row('40 m (in uso)', jitterCurved.current);
row('12 m', jitterCurved.short);
row('adattiva a gradini', jitterCurved.adaptive);
row('adattiva continua', jitterCurved.smooth);
