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

export function interpolatePathState(path: LatLng[], progress: number): { point: LatLng; bearing: number; segmentIndex: number } {
  if (path.length === 0) return { point: { lat: 0, lon: 0 }, bearing: 0, segmentIndex: 0 };
  if (path.length === 1) return { point: path[0], bearing: 0, segmentIndex: 0 };

  const clamped = ((progress % 1) + 1) % 1;
  const segmentLengths = path.slice(0, -1).map((point, index) => distanceMeters(point, path[index + 1]));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);

  if (totalLength === 0) return { point: path[0], bearing: 0, segmentIndex: 0 };

  let remaining = clamped * totalLength;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (remaining <= segmentLength || index === segmentLengths.length - 1) {
      const current = path[index];
      const next = path[index + 1];
      const localProgress = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        point: interpolatePosition(current, next, localProgress),
        bearing: bearingDegrees(current, next),
        segmentIndex: index,
      };
    }
    remaining -= segmentLength;
  }

  const lastIndex = path.length - 2;
  return { point: path[path.length - 1], bearing: bearingDegrees(path[lastIndex], path[path.length - 1]), segmentIndex: lastIndex };
}

export function toLeafletPoint(point: LatLng): [number, number] {
  return [point.lat, point.lon];
}

export function routeProgressAtPoint(path: LatLng[], point: LatLng) {
  if (path.length < 2) return undefined;

  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos((point.lat * Math.PI) / 180);
  const segmentLengths = path.slice(0, -1).map((item, index) => distanceMeters(item, path[index + 1]));
  const totalMeters = segmentLengths.reduce((sum, length) => sum + length, 0);
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
