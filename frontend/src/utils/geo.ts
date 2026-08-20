import type { LatLng } from '../types';

const earthRadiusMeters = 6371000;

export function distanceMeters(a: LatLng, b: LatLng) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(a: LatLng, b: LatLng) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const toDeg = (value: number) => (value * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function offsetPointMeters(point: LatLng, bearing: number, distance: number): LatLng {
  if (!Number.isFinite(bearing) || !Number.isFinite(distance) || distance === 0) return point;

  const angularDistance = distance / earthRadiusMeters;
  const bearingRad = (bearing * Math.PI) / 180;
  const latRad = (point.lat * Math.PI) / 180;
  const lonRad = (point.lon * Math.PI) / 180;
  const targetLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );
  const targetLon =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(targetLat),
    );

  return {
    lat: (targetLat * 180) / Math.PI,
    lon: (targetLon * 180) / Math.PI,
  };
}

export function interpolatePosition(a: LatLng, b: LatLng, progress: number): LatLng {
  const clamped = Math.min(1, Math.max(0, progress));
  return {
    lat: a.lat + (b.lat - a.lat) * clamped,
    lon: a.lon + (b.lon - a.lon) * clamped,
  };
}

export function interpolatePath(path: LatLng[], progress: number): LatLng {
  return interpolatePathState(path, progress).point;
}

export function pathLengthMeters(path: LatLng[]) {
  return path.slice(0, -1).reduce((sum, point, index) => sum + distanceMeters(point, path[index + 1]), 0);
}

// La direzione va misurata su un tratto, non su un segmento.
//
// Le shape GTT sono digitalizzate a passo grosso: fra due segmenti consecutivi
// la direzione cambia in media di 20 gradi, e in un caso su otto di oltre 60.
// Presa dal solo segmento su cui il mezzo si trova, la freccia scatta a ogni
// vertice attraversato — nell'1,6% dei passi di dieci metri ruota di più di 45
// gradi — e sulla mappa si legge come un orientamento casuale.
//
// Misurata fra il punto quaranta metri indietro e quello quaranta metri avanti,
// segue le curve vere e ignora la digitalizzazione: gli scatti oltre i 45 gradi
// spariscono e il 99esimo percentile scende da 59 a 14 gradi.
// **Su una rotonda quella base e' piu' larga della rotonda stessa.** Una
// rotonda torinese misura 30-50 m di diametro, la corda ne misura 80: va
// dall'ingresso all'uscita, e la direzione che ne esce punta attraverso
// l'aiuola invece che lungo la carreggiata. Il mezzo resta orientato uguale
// mentre gira, che e' come si legge sulla mappa.
//
// La base quindi si accorcia dove la strada gira, fino a 9 metri, e resta di 40
// dove scorre. Due cose la tengono onesta:
//
// - **la curvatura si misura nel punto, non nel segmento.** Un segmento lungo
//   duecento metri che finisce in rotonda e' dritto per quasi tutto e curvo
//   alla fine; con un valore solo per segmento si sbagliava proprio l'imbocco.
// - **la transizione e' continua.** Ogni vertice pesa in proporzione a quanto
//   e' vicino e si annulla al bordo della finestra: con soglie secche la
//   direzione salterebbe quando la curvatura le attraversa, cioe' all'ingresso
//   della rotonda, che e' il punto da sistemare.
//
// Misurato sull'implementazione vera, 204.938 campioni su 300 percorsi
// (`npm run measure:bearing` per il confronto fra le strategie):
//
//                              prima      dopo
//   curve strette, mediana     14,7°       3,9°
//   curve strette, p95         56,0°      20,4°
//   curve strette, oltre 45°    9,6%       0,1%
//   tratti scorrevoli, p95      7,0°       6,0°
//
// Sui tratti scorrevoli non peggiora niente: anche la stabilita' migliora, con
// la rotazione ogni dieci metri che scende da 4,9 a 3,8 gradi al p95. In curva
// invece la freccia ruota molto di piu' di prima - mediana da 6,2 a 11,5 gradi
// ogni dieci metri - **ed e' giusto cosi'**: li' il mezzo sta girando davvero,
// ed era la freccia immobile a essere sbagliata.
const BEARING_BASELINE_METERS = 40;
const BEARING_BASELINE_TIGHT_METERS = 9;
// Quanto deve girare la strada dentro la finestra perche' la base cominci ad
// accorciarsi, e quanto perche' sia al minimo.
const TURN_STRAIGHT_DEGREES = 12;
const TURN_TIGHT_DEGREES = 55;

function baselineForTurn(turnDegrees: number) {
  if (turnDegrees <= TURN_STRAIGHT_DEGREES) return BEARING_BASELINE_METERS;
  if (turnDegrees >= TURN_TIGHT_DEGREES) return BEARING_BASELINE_TIGHT_METERS;
  const share = (turnDegrees - TURN_STRAIGHT_DEGREES) / (TURN_TIGHT_DEGREES - TURN_STRAIGHT_DEGREES);
  return BEARING_BASELINE_METERS + (BEARING_BASELINE_TIGHT_METERS - BEARING_BASELINE_METERS) * share;
}

function headingDelta(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// Le lunghezze dei segmenti di una shape non cambiano mai, e misurarle costa
// quanto la shape è lunga. Questa funzione viene chiamata per ogni mezzo a ogni
// fotogramma: rimisurarle trenta volte al secondo per trecento marker portava
// un fotogramma a 155 ms, cioè a uno scatto visibile. Le shape sono oggetti
// stabili, quindi la misura si tiene accanto all'oggetto e si paga una volta.
type MeasuredPath = {
  lengths: number[];
  total: number;
  // Quanto la strada gira a ogni vertice, e a che distanza dall'inizio sta quel
  // vertice: bastano questi due per sapere quanto gira attorno a un punto
  // qualsiasi, senza ricampionare la shape a ogni fotogramma.
  vertexTurns: number[];
  cumulative: number[];
};

const segmentLengthCache = new WeakMap<LatLng[], MeasuredPath>();

// La curvatura si misura **nel punto**, non nel segmento che lo contiene. Un
// segmento lungo duecento metri che finisce dentro una rotonda e' dritto per
// quasi tutta la sua lunghezza e curvo alla fine: attribuirgli un valore solo
// sbagliava proprio l'imbocco, dove il difetto si vede.
//
// Ogni vertice pesa in proporzione a quanto e' vicino, e si annulla al bordo
// della finestra: cosi' entrando e uscendo non fa scattare la base.
function turnAround(measured: MeasuredPath, traveled: number) {
  const { vertexTurns, cumulative } = measured;
  // `cumulative` e' ordinato, quindi il primo vertice della finestra si trova
  // per bisezione. Scorrere dall'inizio a ogni chiamata costava quanto la shape
  // e' lunga, trenta volte al secondo per ogni marker: e' il costo che questa
  // funzione esiste apposta per non pagare.
  let low = 1;
  let high = vertexTurns.length - 1;
  const from = traveled - BEARING_BASELINE_METERS;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] < from) low = middle + 1;
    else high = middle;
  }

  let turn = 0;
  for (let index = low; index < vertexTurns.length; index += 1) {
    const gap = cumulative[index] - traveled;
    if (gap >= BEARING_BASELINE_METERS) break;
    turn += vertexTurns[index] * (1 - Math.abs(gap) / BEARING_BASELINE_METERS);
  }
  return turn;
}

function measurePath(path: LatLng[]): MeasuredPath {
  const cached = segmentLengthCache.get(path);
  if (cached) return cached;
  const lengths = path.slice(0, -1).map((point, index) => distanceMeters(point, path[index + 1]));
  const headings = lengths.map((_, index) => bearingDegrees(path[index], path[index + 1]));
  const cumulative: number[] = [0];
  for (let index = 0; index < lengths.length; index += 1) cumulative.push(cumulative[index] + lengths[index]);
  const vertexTurns = path.map((_, index) =>
    index > 0 && index < headings.length ? headingDelta(headings[index], headings[index - 1]) : 0,
  );
  const measured = {
    lengths,
    total: cumulative[cumulative.length - 1],
    vertexTurns,
    cumulative,
  };
  segmentLengthCache.set(path, measured);
  return measured;
}

function pointAtDistance(path: LatLng[], segmentLengths: number[], distance: number) {
  let remaining = Math.max(0, distance);
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (remaining <= segmentLength || index === segmentLengths.length - 1) {
      const localProgress = segmentLength === 0 ? 0 : Math.min(1, remaining / segmentLength);
      return interpolatePosition(path[index], path[index + 1], localProgress);
    }
    remaining -= segmentLength;
  }
  return path[path.length - 1];
}

export function interpolatePathState(path: LatLng[], progress: number): { point: LatLng; bearing: number; segmentIndex: number } {
  if (path.length === 0) return { point: { lat: 0, lon: 0 }, bearing: 0, segmentIndex: 0 };
  if (path.length === 1) return { point: path[0], bearing: 0, segmentIndex: 0 };

  const clamped = ((progress % 1) + 1) % 1;
  const measured = measurePath(path);
  const { lengths: segmentLengths, total: totalLength } = measured;

  if (totalLength === 0) return { point: path[0], bearing: 0, segmentIndex: 0 };

  const traveled = clamped * totalLength;
  const baseline = baselineForTurn(turnAround(measured, traveled));
  const behind = pointAtDistance(path, segmentLengths, Math.max(0, traveled - baseline));
  const ahead = pointAtDistance(path, segmentLengths, Math.min(totalLength, traveled + baseline));
  const steadyBearing = distanceMeters(behind, ahead) > 1 ? bearingDegrees(behind, ahead) : undefined;

  let remaining = traveled;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (remaining <= segmentLength || index === segmentLengths.length - 1) {
      const current = path[index];
      const next = path[index + 1];
      const localProgress = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        point: interpolatePosition(current, next, localProgress),
        // Il segmento resta il ripiego per i percorsi troppo corti perché una
        // base abbia senso.
        bearing: steadyBearing ?? bearingDegrees(current, next),
        segmentIndex: index,
      };
    }
    remaining -= segmentLength;
  }

  const lastIndex = path.length - 2;
  return {
    point: path[path.length - 1],
    bearing: steadyBearing ?? bearingDegrees(path[lastIndex], path[path.length - 1]),
    segmentIndex: lastIndex,
  };
}

export function toLeafletPoint(point: LatLng): [number, number] {
  return [point.lat, point.lon];
}

export function routeProgressAtPoint(path: LatLng[], point: LatLng) {
  if (path.length < 2) return undefined;

  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos((point.lat * Math.PI) / 180);
  // Stessa misura, stessa cache: anche questa funzione gira per ogni mezzo a
  // ogni aggiornamento.
  const measured = measurePath(path);
  const { lengths: segmentLengths, total: totalMeters } = measured;
  let traveledBefore = 0;
  let best:
    | {
        distanceMeters: number;
        traveledMeters: number;
        remainingMeters: number;
        bearing: number;
        projectedPoint: LatLng;
      }
    | undefined;

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const ax = start.lon * metersPerDegreeLon;
    const ay = start.lat * metersPerDegreeLat;
    const bx = end.lon * metersPerDegreeLon;
    const by = end.lat * metersPerDegreeLat;
    const px = point.lon * metersPerDegreeLon;
    const py = point.lat * metersPerDegreeLat;
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const segmentMeters = segmentLengths[index];
    const segmentSquared = vx * vx + vy * vy;
    const t = segmentSquared === 0 ? 0 : Math.min(1, Math.max(0, (wx * vx + wy * vy) / segmentSquared));
    const projected = {
      lat: start.lat + (end.lat - start.lat) * t,
      lon: start.lon + (end.lon - start.lon) * t,
    };
    const offRouteMeters = distanceMeters(projected, point);
    const traveledMeters = traveledBefore + segmentMeters * t;
    const candidate = {
      distanceMeters: offRouteMeters,
      traveledMeters,
      remainingMeters: Math.max(0, totalMeters - traveledMeters),
      bearing: bearingDegrees(start, end),
      projectedPoint: projected,
    };

    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate;
    traveledBefore += segmentMeters;
  }

  // La stessa base di quaranta metri di `interpolatePathState`, e per la stessa
  // ragione. Qui mancava: la direzione usciva dal singolo segmento su cui il
  // mezzo era proiettato, e questa - non l'altra - è quella che finisce nella
  // freccia sulla mappa, perché lo snap sul percorso ha la precedenza sulla
  // direzione calcolata durante l'animazione. Correggerne una sola lasciava il
  // difetto intatto dove si vedeva.
  if (best) {
    // Stessa base adattiva della riproduzione: se le due funzioni misurassero
    // la direzione su tratti diversi, il mezzo cambierebbe orientamento nel
    // passaggio dall'una all'altra.
    const baseline = baselineForTurn(turnAround(measured, best.traveledMeters));
    const behind = pointAtDistance(path, segmentLengths, Math.max(0, best.traveledMeters - baseline));
    const ahead = pointAtDistance(path, segmentLengths, Math.min(totalMeters, best.traveledMeters + baseline));
    if (distanceMeters(behind, ahead) > 1) best.bearing = bearingDegrees(behind, ahead);
  }

  return best;
}
