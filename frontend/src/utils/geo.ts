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
const BEARING_BASELINE_METERS = 40;

// Le lunghezze dei segmenti di una shape non cambiano mai, e misurarle costa
// quanto la shape è lunga. Questa funzione viene chiamata per ogni mezzo a ogni
// fotogramma: rimisurarle trenta volte al secondo per trecento marker portava
// un fotogramma a 155 ms, cioè a uno scatto visibile. Le shape sono oggetti
// stabili, quindi la misura si tiene accanto all'oggetto e si paga una volta.
const segmentLengthCache = new WeakMap<LatLng[], { lengths: number[]; total: number }>();

function measurePath(path: LatLng[]) {
  const cached = segmentLengthCache.get(path);
  if (cached) return cached;
  const lengths = path.slice(0, -1).map((point, index) => distanceMeters(point, path[index + 1]));
  const measured = { lengths, total: lengths.reduce((sum, length) => sum + length, 0) };
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
  const { lengths: segmentLengths, total: totalLength } = measurePath(path);

  if (totalLength === 0) return { point: path[0], bearing: 0, segmentIndex: 0 };

  const traveled = clamped * totalLength;
  const behind = pointAtDistance(path, segmentLengths, Math.max(0, traveled - BEARING_BASELINE_METERS));
  const ahead = pointAtDistance(path, segmentLengths, Math.min(totalLength, traveled + BEARING_BASELINE_METERS));
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
  const { lengths: segmentLengths, total: totalMeters } = measurePath(path);
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

  return best;
}
