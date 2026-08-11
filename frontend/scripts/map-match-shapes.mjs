// Aggancia le shape GTT alla rete stradale reale.
//
// Le shape pubblicate da GTT sono schematiche: fra un vertice e l'altro
// corrono 48,8 m di mediana e fino a 5,8 km, quindi una rotonda viene tagliata
// da una corda e il mezzo che segue la linea la taglia con lei. Nessuna
// interpolazione puo' inventare la strada che i dati non contengono: l'unico
// modo e' chiedere a chi la strada ce l'ha, cioe' OSM.
//
//   node scripts/map-match-shapes.mjs [opzioni]
//
//   --base-url <url>     servizio OSRM (default: router.project-osrm.org)
//   --profile <nome>     profilo OSRM, default `driving`
//   --limit <n>          lavora solo sulle prime n varianti (prove)
//   --line <nome>        solo le varianti di questa linea (prove)
//   --tolerance <m>      semplificazione dopo l'aggancio, default 3 m
//   --delay <ms>         pausa fra due richieste, default 200
//   --cache-dir <path>   risultati per shape, per riprendere dopo un errore
//   --out <path>         file da riscrivere, default il network pubblicato
//   --fake               nessuna rete: il matcher restituisce la traccia
//                        infittita. Serve a provare la pipeline, non i dati.
//   --dry-run            stampa il piano e si ferma
//
// **La geometria agganciata non viene accettata a scatola chiusa.** Per ogni
// variante si misura quanto la strada trovata si discosta dalla traccia di
// partenza: se se ne allontana troppo, il servizio ha preso un'altra strada, e
// una strada sbagliata precisa e' peggio di una corda giusta. In quel caso la
// shape originale resta dov'e' ed entra nel rapporto finale.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const BASE_URL = arg('base-url', 'https://router.project-osrm.org');
const PROFILE = arg('profile', 'driving');
const TOLERANCE_METERS = Number(arg('tolerance', '3'));
const DELAY_MS = Number(arg('delay', '200'));
const CACHE_DIR = arg('cache-dir', '.cache/map-match');
const NETWORK_PATH = arg('out', 'public/assets/gtfs-network.json');
const LIMIT = Number(arg('limit', '0'));
const ONLY_LINE = arg('line', '');
const FAKE = flag('fake');
const DRY_RUN = flag('dry-run');

// OSRM demo accetta 100 coordinate per richiesta: le shape lunghe vanno spezzate
// e ricucite, con un punto di sovrapposizione perche' i tratti si tocchino.
const CHUNK_POINTS = 90;
const CHUNK_OVERLAP = 1;
// Quanto lontano dalla traccia il servizio puo' cercare la strada. Le shape GTT
// sono schematiche, non tracce GPS: stringere qui produce "NoMatch".
const SEARCH_RADIUS_METERS = 60;

// Soglie di accettazione, misurate sui vertici originali contro la geometria
// agganciata. Sono volutamente larghe: servono a scartare la strada sbagliata,
// non a pretendere la coincidenza.
const MAX_P95_DEVIATION_METERS = 35;
const MAX_DEVIATION_METERS = 150;
const MIN_LENGTH_RATIO = 0.85;
const MAX_LENGTH_RATIO = 1.8;

const R = 6371000;
const toRad = (value) => (value * Math.PI) / 180;
function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function pathLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) total += distanceMeters(points[i], points[i + 1]);
  return total;
}
function distanceToSegment(point, a, b) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos(toRad(point.lat));
  const ax = a.lon * mLon;
  const ay = a.lat * mLat;
  const vx = b.lon * mLon - ax;
  const vy = b.lat * mLat - ay;
  const wx = point.lon * mLon - ax;
  const wy = point.lat * mLat - ay;
  const squared = vx * vx + vy * vy;
  const t = squared === 0 ? 0 : Math.min(1, Math.max(0, (wx * vx + wy * vy) / squared));
  const dx = ax + vx * t - point.lon * mLon;
  const dy = ay + vy * t - point.lat * mLat;
  return Math.sqrt(dx * dx + dy * dy);
}
function distanceToPath(point, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    best = Math.min(best, distanceToSegment(point, points[i], points[i + 1]));
    if (best === 0) break;
  }
  return best;
}

// Douglas-Peucker. Serve a togliere i punti che non dicono niente - una strada
// dritta agganciata torna con un vertice ogni pochi metri - senza toccare le
// curve, che sono esattamente il motivo per cui stiamo facendo tutto questo.
function simplifyPath(points, tolerance) {
  if (points.length < 3 || tolerance <= 0) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const deviation = distanceToSegment(points[i], points[first], points[last]);
      if (deviation > worst) {
        worst = deviation;
        index = i;
      }
    }
    if (index >= 0 && worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'BusRadar shape map-matching (civic-tech, one-off)' } });
      if (response.status === 429 || response.status >= 500) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!response.ok) return { error: `HTTP ${response.status}` };
      return { data: await response.json() };
    } catch (error) {
      await sleep(1500 * (attempt + 1));
      if (attempt === 3) return { error: String(error) };
    }
  }
  return { error: 'troppi tentativi' };
}

// Il matcher finto infittisce la traccia senza uscirne: la pipeline si prova
// senza rete, ma il risultato non e' geometria stradale e non va pubblicato.
function fakeMatch(points) {
  const dense = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const steps = Math.max(1, Math.round(distanceMeters(points[i], points[i + 1]) / 12));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      dense.push({
        lat: points[i].lat + (points[i + 1].lat - points[i].lat) * t,
        lon: points[i].lon + (points[i + 1].lon - points[i].lon) * t,
      });
    }
  }
  dense.push(points[points.length - 1]);
  return dense;
}

async function matchChunk(points) {
  if (FAKE) return { matched: fakeMatch(points) };
  const coordinates = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const radiuses = points.map(() => SEARCH_RADIUS_METERS).join(';');
  const url = `${BASE_URL}/match/v1/${PROFILE}/${coordinates}`
    + `?geometries=geojson&overview=full&gaps=ignore&tidy=false&radiuses=${radiuses}`;
  const { data, error } = await requestJson(url);
  if (error) return { error };
  if (data?.code !== 'Ok' || !Array.isArray(data.matchings) || data.matchings.length === 0) {
    return { error: data?.code ?? 'risposta senza matching' };
  }
  const matched = [];
  for (const matching of data.matchings) {
    for (const [lon, lat] of matching.geometry?.coordinates ?? []) {
      const last = matched[matched.length - 1];
      if (!last || last.lat !== lat || last.lon !== lon) matched.push({ lat, lon });
    }
  }
  return matched.length >= 2 ? { matched } : { error: 'matching vuoto' };
}

async function matchPath(points) {
  const stitched = [];
  const problems = [];
  for (let start = 0; start < points.length - 1; start += CHUNK_POINTS - CHUNK_OVERLAP) {
    const chunk = points.slice(start, start + CHUNK_POINTS);
    if (chunk.length < 2) break;
    const { matched, error } = await matchChunk(chunk);
    if (error) {
      problems.push(error);
      // Un tratto che il servizio non aggancia non si butta: si tiene come sta,
      // cosi' il resto della linea guadagna comunque la geometria vera.
      for (const point of chunk) {
        const last = stitched[stitched.length - 1];
        if (!last || distanceMeters(last, point) > 0.5) stitched.push(point);
      }
    } else {
      for (const point of matched) {
        const last = stitched[stitched.length - 1];
        if (!last || distanceMeters(last, point) > 0.5) stitched.push(point);
      }
    }
    if (!FAKE) await sleep(DELAY_MS);
  }
  return { stitched, problems };
}

// Il controllo che decide se pubblicare o no.
function judge(original, matched) {
  if (matched.length < 2) return { ok: false, reason: 'geometria vuota' };
  const deviations = original.map((point) => distanceToPath(point, matched)).sort((a, b) => a - b);
  const p95 = deviations[Math.floor(deviations.length * 0.95)] ?? 0;
  const worst = deviations[deviations.length - 1] ?? 0;
  const ratio = pathLength(matched) / Math.max(1, pathLength(original));
  if (p95 > MAX_P95_DEVIATION_METERS) return { ok: false, reason: `si allontana (p95 ${p95.toFixed(0)} m)`, p95, worst, ratio };
  if (worst > MAX_DEVIATION_METERS) return { ok: false, reason: `punta fuori strada (max ${worst.toFixed(0)} m)`, p95, worst, ratio };
  if (ratio < MIN_LENGTH_RATIO || ratio > MAX_LENGTH_RATIO) {
    return { ok: false, reason: `lunghezza incoerente (${ratio.toFixed(2)}x)`, p95, worst, ratio };
  }
  return { ok: true, p95, worst, ratio };
}

// Le soglie sopra decidono cosa viene pubblicato, quindi vanno provate su casi
// che si sanno gia' come devono finire. `--self-check` non tocca la rete.
if (flag('self-check')) {
  const circle = (centre, radiusMeters, fromDeg, toDeg, steps) => {
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const angle = toRad(fromDeg + ((toDeg - fromDeg) * i) / steps);
      points.push({
        lat: centre.lat + (radiusMeters * Math.cos(angle)) / 111320,
        lon: centre.lon + (radiusMeters * Math.sin(angle)) / (111320 * Math.cos(toRad(centre.lat))),
      });
    }
    return points;
  };
  const centre = { lat: 45.052, lon: 7.587 };
  const rotonda = circle(centre, 20, 0, 180, 40);
  const corda = [rotonda[0], rotonda[rotonda.length - 1]];
  const spostata = corda.map((p) => ({ lat: p.lat + 200 / 111320, lon: p.lon }));
  const scostamentoLieve = circle({ lat: centre.lat + 12 / 111320, lon: centre.lon }, 20, 0, 180, 40);
  const dirittaFitta = Array.from({ length: 100 }, (_, i) => ({ lat: 45 + i * 0.00001, lon: 7.5 }));

  const casi = [
    ['la rotonda al posto della corda va accettata', judge(corda, rotonda).ok, true],
    ['una strada parallela a 200 m va scartata', judge(corda, spostata).ok, false],
    ['uno scostamento di 12 m va accettato', judge(corda, scostamentoLieve).ok, true],
    ['una geometria vuota va scartata', judge(corda, [corda[0]]).ok, false],
    // La proprieta' vera di Douglas-Peucker: nessun punto scartato si allontana
    // dalla spezzata che resta piu' della tolleranza. Contare i punti sarebbe
    // un numero inventato - una semicirconferenza di raggio 20 m ne richiede
    // quattro perche' la freccia resti sotto i 3 m.
    ['la rotonda resta entro la tolleranza', (() => {
      const ridotta = simplifyPath(rotonda, 3);
      return ridotta.length >= 4 && rotonda.every((p) => distanceToPath(p, ridotta) <= 3.01);
    })(), true],
    ['la rotonda non diventa una corda', simplifyPath(rotonda, 3).length > 2, true],
    ['una dritta infittita collassa', simplifyPath(dirittaFitta, 3).length === 2, true],
  ];
  let falliti = 0;
  for (const [nome, esito, atteso] of casi) {
    if (esito !== atteso) falliti += 1;
    console.log(`  ${esito === atteso ? 'ok  ' : 'NO  '} ${nome}`);
  }
  console.log(falliti === 0 ? '\nTutti i casi passano.' : `\n${falliti} casi falliti.`);
  process.exit(falliti === 0 ? 0 : 1);
}

const network = JSON.parse(fs.readFileSync(NETWORK_PATH, 'utf8'));
let routes = network.routes.filter((route) => Array.isArray(route.path) && route.path.length >= 2);
if (ONLY_LINE) routes = routes.filter((route) => route.line === ONLY_LINE);
if (LIMIT > 0) routes = routes.slice(0, LIMIT);

const before = routes.reduce((sum, route) => sum + route.path.length, 0);
console.log(`Varianti da agganciare: ${routes.length} · vertici di partenza: ${before}`);
console.log(`Servizio: ${FAKE ? 'finto (nessuna rete)' : `${BASE_URL} profilo ${PROFILE}`}`);
console.log(`Semplificazione dopo l'aggancio: ${TOLERANCE_METERS} m · pausa fra richieste: ${DELAY_MS} ms`);
if (DRY_RUN) {
  const chunks = routes.reduce((sum, r) => sum + Math.ceil((r.path.length - 1) / (CHUNK_POINTS - CHUNK_OVERLAP)), 0);
  console.log(`Richieste previste: ~${chunks}, cioe' ~${Math.round((chunks * DELAY_MS) / 60000)} minuti di sole pause.`);
  process.exit(0);
}

fs.mkdirSync(CACHE_DIR, { recursive: true });
const report = { matched: 0, kept: 0, failures: [] };
let done = 0;

for (const route of routes) {
  done += 1;
  const cachePath = path.join(CACHE_DIR, `${route.shapeId.replace(/[^\w.-]/g, '_')}.json`);
  let matched;
  if (fs.existsSync(cachePath)) {
    matched = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } else {
    const { stitched, problems } = await matchPath(route.path);
    matched = { path: stitched, problems };
    fs.writeFileSync(cachePath, JSON.stringify(matched));
  }

  const simplified = simplifyPath(matched.path, TOLERANCE_METERS);
  const verdict = judge(route.path, simplified);
  if (verdict.ok) {
    route.path = simplified.map(({ lat, lon }) => ({
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
    }));
    report.matched += 1;
  } else {
    report.kept += 1;
    report.failures.push(`${route.id} (${route.line}): ${verdict.reason}`);
  }
  if (done % 25 === 0 || done === routes.length) {
    console.log(`  ${done}/${routes.length} · agganciate ${report.matched} · lasciate come erano ${report.kept}`);
  }
}

const after = routes.reduce((sum, route) => sum + route.path.length, 0);
fs.writeFileSync(NETWORK_PATH, JSON.stringify(network));
const sizeMb = (fs.statSync(NETWORK_PATH).size / (1024 * 1024)).toFixed(2);

console.log(`\nAgganciate ${report.matched} varianti su ${routes.length}, ${report.kept} lasciate come erano.`);
console.log(`Vertici: ${before} → ${after} (${(after / before).toFixed(1)}x) · ${NETWORK_PATH} ora pesa ${sizeMb} MB.`);
if (report.failures.length > 0) {
  console.log(`\nNon agganciate, e il perche' (prime 20 di ${report.failures.length}):`);
  report.failures.slice(0, 20).forEach((line) => console.log(`  - ${line}`));
  console.log('\nQueste tengono la shape GTT originale: la mappa non peggiora, semplicemente non migliora li.');
}
console.log('\nDopo questo va rigenerato il profilo delle corse: npm run gtfs:runs');
