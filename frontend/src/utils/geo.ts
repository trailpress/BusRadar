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

export function interpolatePath(path: LatLng[], progress: number): LatLng {
  if (path.length === 0) return { lat: 0, lon: 0 };
  if (path.length === 1) return path[0];

  const clamped = ((progress % 1) + 1) % 1;
  const scaled = clamped * (path.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(index + 1, path.length - 1);
  const localProgress = scaled - index;
  const current = path[index];
  const next = path[nextIndex];

  return {
    lat: current.lat + (next.lat - current.lat) * localProgress,
    lon: current.lon + (next.lon - current.lon) * localProgress,
  };
}

export function toLeafletPoint(point: LatLng): [number, number] {
  return [point.lat, point.lon];
}
