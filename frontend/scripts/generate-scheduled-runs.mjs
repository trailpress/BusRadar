// Precalcola le corse programmate, per poterle disegnare come "non accertate"
// dove il realtime tace.
//
// Il problema è che gli orari pubblicati sono indicizzati per fermata, non per
// corsa: ogni bucket dice quando una linea passa da una fermata, senza id di
// corsa né numero d'ordine. Ricostruire una corsa significa incatenare — si
// parte dal capolinea all'ora X e a ogni fermata si prende la prima chiamata
// successiva a quella già raggiunta.
//
// A runtime costerebbe i bucket di tutte le fermate di ogni linea silenziosa:
// 24 MB, su un telefono. Qui si paga una volta sola, in compilazione, e ne esce
// un profilo per variante — quanti secondi dopo la partenza il mezzo si trova a
// ogni fermata — più l'elenco delle partenze dal capolinea. Il resto è
// interpolazione.
//
// L'incatenamento può agganciare la corsa sbagliata quando una fermata è
// servita nei due sensi. Il controllo che lo smaschera è geometrico: la
// velocità implicita fra due fermate, che si conosce perché la distanza lungo
// la shape è nota. Gli agganci fuori da 2-110 km/h vengono scartati invece che
// creduti.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public', 'assets');
const scheduleDir = path.join(publicDir, 'stop-schedule');
const outputPath = path.join(publicDir, 'scheduled-runs.json');

const MIN_PLAUSIBLE_KMH = 2;
const MAX_PLAUSIBLE_KMH = 110;
const MAX_LINK_SECONDS = 1800;
// Corse campione da cui ricavare il profilo mediano della variante.
const PROFILE_SAMPLES = 8;

const network = JSON.parse(fs.readFileSync(path.join(publicDir, 'gtfs-network.json'), 'utf8'));
const stopById = new Map(network.stops.map((stop) => [stop.id, stop]));

function bucketOf(stopId) {
  let hash = 0x811c9dc5;
  const value = String(stopId);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 256;
}

const bucketCache = new Map();
function bucketPayload(stopId) {
  const bucket = bucketOf(stopId);
  if (!bucketCache.has(bucket)) {
    const file = path.join(scheduleDir, `${bucket}.json`);
    bucketCache.set(bucket, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined);
  }
  return bucketCache.get(bucket);
}

// Chiamate a una fermata per una linea, con il servizio a cui appartengono.
function callsAt(stopId, line) {
  const payload = bucketPayload(stopId);
  if (!payload) return [];
  return (payload.stops[stopId] ?? [])
    .map(([serviceIndex, routeIndex, seconds]) => ({
      serviceId: payload.services[serviceIndex],
      line: payload.routes[routeIndex]?.[1],
      seconds,
    }))
    .filter((call) => call.line === line)
    .sort((a, b) => a.seconds - b.seconds);
}

function metersAlongShape(path_, stops) {
  if (path_.length < 2) return [];
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos((path_[0].lat * Math.PI) / 180);
  const cumulative = [0];
  for (let index = 0; index < path_.length - 1; index += 1) {
    const dy = (path_[index + 1].lat - path_[index].lat) * metersPerDegreeLat;
    const dx = (path_[index + 1].lon - path_[index].lon) * metersPerDegreeLon;
    cumulative.push(cumulative[index] + Math.hypot(dx, dy));
  }

  return stops.map((stop) => {
    if (!stop) return undefined;
    const px = stop.lon * metersPerDegreeLon;
    const py = stop.lat * metersPerDegreeLat;
    let bestSquared = Number.POSITIVE_INFINITY;
    let bestMeters = 0;
    for (let index = 0; index < path_.length - 1; index += 1) {
      const ax = path_[index].lon * metersPerDegreeLon;
      const ay = path_[index].lat * metersPerDegreeLat;
      const vx = path_[index + 1].lon * metersPerDegreeLon - ax;
      const vy = path_[index + 1].lat * metersPerDegreeLat - ay;
      const segmentSquared = vx * vx + vy * vy;
      const t = segmentSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / segmentSquared));
      const dx = ax + vx * t - px;
      const dy = ay + vy * t - py;
      const squared = dx * dx + dy * dy;
      if (squared < bestSquared) {
        bestSquared = squared;
        bestMeters = cumulative[index] + (cumulative[index + 1] - cumulative[index]) * t;
      }
    }
    return bestSquared <= 120 * 120 ? bestMeters : undefined;
  });
}

function median(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

let rejectedLinks = 0;
let acceptedLinks = 0;

// Segue una partenza lungo la variante, tenendo solo gli agganci che
// corrispondono a una velocità possibile su quel tratto.
function chainRun(stopIds, meters, line, departureSeconds) {
  const offsets = new Array(stopIds.length).fill(undefined);
  offsets[0] = 0;
  let reachedSeconds = departureSeconds;
  let reachedIndex = 0;

  for (let index = 1; index < stopIds.length; index += 1) {
    const next = callsAt(stopIds[index], line).find((call) => call.seconds > reachedSeconds);
    if (!next || next.seconds - reachedSeconds > MAX_LINK_SECONDS) continue;
    const fromMeters = meters[reachedIndex];
    const toMeters = meters[index];
    if (fromMeters == null || toMeters == null || toMeters <= fromMeters) continue;
    const kmh = ((toMeters - fromMeters) / (next.seconds - reachedSeconds)) * 3.6;
    if (kmh < MIN_PLAUSIBLE_KMH || kmh > MAX_PLAUSIBLE_KMH) {
      rejectedLinks += 1;
      continue;
    }
    acceptedLinks += 1;
    offsets[index] = next.seconds - departureSeconds;
    reachedSeconds = next.seconds;
    reachedIndex = index;
  }

  return offsets;
}

const variants = [];
let skippedVariants = 0;

// Una partenza appartiene a una corsa sola, ma gli orari per fermata non dicono
// a quale variante: al capolinea si legge solo "la linea 1510 parte alle 8:12".
// Presa alla lettera, ogni ramo che condivide quel capolinea rivendicava tutte
// le partenze della linea — su 485 partenze della 1510, 387 finivano a più
// varianti — e la mappa mostrava cinque corse ammassate in cento metri.
//
// Ogni partenza viene quindi assegnata a una variante sola. Quale, i dati non
// lo dicono: si sceglie il ramo più completo, perché è quello che nel dubbio
// descrive meglio il percorso. È una convenzione dichiarata, non una verità
// ricavata, ed è il motivo per cui queste corse restano "non accertate".
const claimedDepartures = new Map();
const routesByCompleteness = [...network.routes].sort(
  (a, b) => b.stopEntries.length - a.stopEntries.length,
);

for (const route of routesByCompleteness) {
  const stopIds = route.stopEntries.map((entry) => entry.stopId);
  if (stopIds.length < 2) {
    skippedVariants += 1;
    continue;
  }
  const meters = metersAlongShape(route.path, stopIds.map((stopId) => stopById.get(stopId)));
  const departures = callsAt(stopIds[0], route.line).filter((departure) => {
    const key = `${route.line}|${departure.serviceId}|${departure.seconds}`;
    if (claimedDepartures.has(key)) return false;
    claimedDepartures.set(key, route.id);
    return true;
  });
  if (departures.length === 0) {
    skippedVariants += 1;
    continue;
  }

  // Il profilo è la mediana su alcune corse sparse nella giornata: una singola
  // corsa erediterebbe il traffico della propria ora.
  const step = Math.max(1, Math.floor(departures.length / PROFILE_SAMPLES));
  const sampled = departures.filter((_, index) => index % step === 0).slice(0, PROFILE_SAMPLES);
  const perStop = stopIds.map(() => []);
  for (const departure of sampled) {
    const offsets = chainRun(stopIds, meters, route.line, departure.seconds);
    offsets.forEach((offset, index) => {
      if (offset != null) perStop[index].push(offset);
    });
  }

  // Ancore utilizzabili: fermata posizionata sulla shape, tempo noto, e ordine
  // rispettato. Una variante con meno di due ancore non si sa disegnare.
  const anchors = [];
  let lastSeconds = -1;
  let lastMeters = -1;
  stopIds.forEach((stopId, index) => {
    const seconds = median(perStop[index]);
    const atMeters = meters[index];
    if (seconds == null || atMeters == null) return;
    if (seconds <= lastSeconds || atMeters <= lastMeters) return;
    anchors.push([Math.round(atMeters), Math.round(seconds)]);
    lastSeconds = seconds;
    lastMeters = atMeters;
  });

  if (anchors.length < 2) {
    skippedVariants += 1;
    continue;
  }

  variants.push({
    id: route.id,
    line: route.line,
    runs: departures.map((departure) => [departure.serviceId, departure.seconds]),
    anchors,
  });
}

// I service id si ripetono ovunque: elencarli una volta e indicizzarli fa la
// differenza fra un artefatto da consegnare e uno da evitare.
const serviceIds = [...new Set(variants.flatMap((variant) => variant.runs.map(([serviceId]) => serviceId)))];
const serviceIndex = new Map(serviceIds.map((serviceId, index) => [serviceId, index]));

const payload = {
  generatedAt: new Date().toISOString(),
  source: network.source,
  services: serviceIds,
  variants: variants.map((variant) => ({
    id: variant.id,
    line: variant.line,
    runs: variant.runs.map(([serviceId, seconds]) => [serviceIndex.get(serviceId), seconds]),
    anchors: variant.anchors,
  })),
};

fs.writeFileSync(outputPath, JSON.stringify(payload));
const sizeMb = fs.statSync(outputPath).size / 1024 / 1024;

console.log(`Scheduled runs written for ${variants.length} variants (${skippedVariants} without a usable profile).`);
console.log(`Links kept ${acceptedLinks}, rejected as impossible speeds ${rejectedLinks}.`);
console.log(`Runs ${payload.variants.reduce((sum, variant) => sum + variant.runs.length, 0)}, services ${serviceIds.length}.`);
console.log(`${path.relative(process.cwd(), outputPath)}: ${sizeMb.toFixed(2)} MB.`);
