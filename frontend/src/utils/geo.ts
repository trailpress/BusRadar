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
