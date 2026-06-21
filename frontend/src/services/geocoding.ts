import type { LatLng } from '../types';

export type GeocodingResult = LatLng & {
  label: string;
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  importance?: number;
  type?: string;
  class?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    road?: string;
    suburb?: string;
  };
};

const geocoderUrl = import.meta.env.VITE_GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search';
const cacheKey = 'busradar-geocoding-v2';
const torinoCenter = { lat: 45.0706, lon: 7.6867 };
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

function distanceScore(result: NominatimResult, bias?: LatLng) {
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Number.POSITIVE_INFINITY;
  const target = bias ?? torinoCenter;
  const latDelta = (lat - target.lat) * 111;
  const lonDelta = (lon - target.lon) * 78;
  return Math.hypot(latDelta, lonDelta);
}

function resultScore(result: NominatimResult, query: string, bias?: LatLng) {
  const normalizedQuery = query.trim().toLowerCase();
  const name = result.display_name?.toLowerCase() ?? '';
  const exactLead = name.split(',')[0]?.trim() === normalizedQuery ? 4 : 0;
  const tokenMatches = normalizedQuery.split(/\s+/).filter((token) => name.includes(token)).length;
  const locality = [result.address?.city, result.address?.town, result.address?.village, result.address?.municipality]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const torinoArea = /torino|orbassano|moncalieri|nichelino|collegno|grugliasco|rivoli|venaria|settimo/.test(locality) ? 2 : 0;
  const usefulType = ['house', 'residential', 'road', 'pedestrian', 'square', 'station', 'bus_stop'].includes(result.type ?? '') ? 1 : 0;
  return exactLead + tokenMatches + torinoArea + usefulType + Number(result.importance ?? 0) * 2 - distanceScore(result, bias) * 0.035;
}

export async function geocodeTransitArea(query: string, bias?: LatLng): Promise<GeocodingResult | undefined> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3) return undefined;

  const cache = readCache();
  const cacheEntry = cache[normalized];
  if (cacheEntry) return cacheEntry;

  const waitMs = Math.max(0, 1000 - (Date.now() - lastRequestAt));
  if (waitMs > 0) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();

  const params = new URLSearchParams({
    q: `${query.trim()}, Piemonte, Italia`,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '8',
    countrycodes: 'it',
    viewbox: '7.25,45.35,8.15,44.75',
    bounded: '1',
  });
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);
  let response: Response;
  try {
    response = await fetch(`${geocoderUrl}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);

  const results = (await response.json()) as NominatimResult[];
  const [result] = [...results].sort((a, b) => resultScore(b, query, bias) - resultScore(a, query, bias));
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
