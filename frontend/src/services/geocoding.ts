import type { LatLng } from '../types';

export type GeocodingResult = LatLng & {
  label: string;
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

const geocoderUrl = import.meta.env.VITE_GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search';
const cacheKey = 'busradar-geocoding-v1';
let lastRequestAt = 0;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(cacheKey) ?? '{}') as Record<string, GeocodingResult>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, GeocodingResult>) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cache));
  } catch {
    // Search remains functional when storage is unavailable.
  }
}

export async function geocodeTransitArea(query: string): Promise<GeocodingResult | undefined> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3) return undefined;

  const cache = readCache();
  if (cache[normalized]) return cache[normalized];

  const waitMs = Math.max(0, 1000 - (Date.now() - lastRequestAt));
  if (waitMs > 0) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();

  const params = new URLSearchParams({
    q: `${query.trim()}, Piemonte, Italia`,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'it',
    viewbox: '7.25,45.35,8.15,44.75',
    bounded: '1',
  });
  const response = await fetch(`${geocoderUrl}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);

  const [result] = (await response.json()) as NominatimResult[];
  const lat = Number(result?.lat);
  const lon = Number(result?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;

  const resolved = {
    lat,
    lon,
    label: result.display_name?.split(',').slice(0, 3).join(',') ?? query.trim(),
  };
  cache[normalized] = resolved;
  writeCache(cache);
  return resolved;
}
