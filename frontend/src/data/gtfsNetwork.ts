import type { LatLng, TransitLine } from '../types';

export type GtfsRouteVariant = {
  id: string;
  routeId: string;
  line: string;
  directionId: string;
  headsign: string;
  shapeId: string;
  vehicleType: 'bus' | 'tram';
  color: string;
  path: LatLng[];
  stops: string[];
  stopEntries: Array<{ stopId: string; sequence: number }>;
};

export type GtfsStop = LatLng & {
  id: string;
  code: string;
  name: string;
  url: string;
  lines: string[];
};

export type GtfsLine = TransitLine & {
  vehicleType: 'bus' | 'tram';
};

export type GtfsNetwork = {
  generatedAt: string;
  source: string;
  lines: GtfsLine[];
  routes: GtfsRouteVariant[];
  stops: GtfsStop[];
};

export const gtfsNetwork: GtfsNetwork = {
  generatedAt: '',
  source: 'GTT GTFS static',
  lines: [],
  routes: [],
  stops: [],
};

const routesByRouteId = new Map<string, GtfsRouteVariant[]>();
const routesByLine = new Map<string, GtfsRouteVariant[]>();
const routeByVariantId = new Map<string, GtfsRouteVariant>();
const lineById = new Map<string, GtfsLine>();
const stopById = new Map<string, GtfsStop>();
const listeners = new Set<() => void>();
let revision = 0;
let loadPromise: Promise<GtfsNetwork> | undefined;
let loaded = false;

function rebuildIndexes() {
  routesByRouteId.clear();
  routesByLine.clear();
  routeByVariantId.clear();
  lineById.clear();
  stopById.clear();

  gtfsNetwork.routes.forEach((route) => {
    routeByVariantId.set(route.id, route);
    routesByRouteId.set(route.routeId, [...(routesByRouteId.get(route.routeId) ?? []), route]);
    routesByLine.set(route.line, [...(routesByLine.get(route.line) ?? []), route]);
  });
  gtfsNetwork.lines.forEach((line) => lineById.set(line.id, line));
  gtfsNetwork.stops.forEach((stop) => stopById.set(stop.id, stop));
}

function publishNetwork(network: GtfsNetwork) {
  gtfsNetwork.generatedAt = network.generatedAt;
  gtfsNetwork.source = network.source;
  gtfsNetwork.lines = network.lines;
  gtfsNetwork.routes = network.routes;
  gtfsNetwork.stops = network.stops;
  rebuildIndexes();
  loaded = true;
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function loadGtfsNetwork() {
  if (loaded) return Promise.resolve(gtfsNetwork);
  loadPromise ??= fetch(`${import.meta.env.BASE_URL}assets/gtfs-network.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`GTFS network HTTP ${response.status}`);
      return response.json() as Promise<GtfsNetwork>;
    })
    .then((network) => {
      publishNetwork(network);
      return gtfsNetwork;
    })
    .catch((error) => {
      loadPromise = undefined;
      throw error;
    });
  return loadPromise;
}

export function subscribeGtfsNetwork(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGtfsNetworkRevision() {
  return revision;
}

export function isGtfsNetworkLoaded() {
  return loaded;
}

export function getGtfsLine(lineId: string) {
  return lineById.get(lineId);
}

export function getGtfsRoutesForLine(lineId?: string) {
  if (!lineId) return gtfsNetwork.routes;
  return routesByLine.get(lineId) ?? [];
}

export function getGtfsRouteDirectionKey(route: GtfsRouteVariant) {
  const headsign = route.headsign.trim().replace(/\s+/g, ' ').toLocaleUpperCase('it');
  return `${route.directionId || '0'}:${headsign || route.id}`;
}

function routePathLengthMeters(route: GtfsRouteVariant) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  return route.path.slice(1).reduce((total, point, index) => {
    const previous = route.path[index];
    const latitudeDelta = toRadians(point.lat - previous.lat);
    const longitudeDelta = toRadians(point.lon - previous.lon);
    const previousLatitude = toRadians(previous.lat);
    const latitude = toRadians(point.lat);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(previousLatitude) * Math.cos(latitude) * Math.sin(longitudeDelta / 2) ** 2;
    return total + 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
  }, 0);
}

export function getCanonicalGtfsRoutesForLine(lineId?: string) {
  const routes = getGtfsRoutesForLine(lineId);
  const longestByDirection = new Map<string, GtfsRouteVariant>();
  routes.forEach((route) => {
    const key = getGtfsRouteDirectionKey(route);
    const existing = longestByDirection.get(key);
    if (!existing || routePathLengthMeters(route) > routePathLengthMeters(existing)) {
      longestByDirection.set(key, route);
    }
  });
  return [...longestByDirection.values()].sort((a, b) => a.directionId.localeCompare(b.directionId));
}

export function getGtfsRoutesForRouteId(routeId?: string) {
  if (!routeId) return [];
  return routesByRouteId.get(routeId) ?? routesByRouteId.get(`${routeId}U`) ?? routesByLine.get(routeId.replace(/U$/, '')) ?? [];
}

export function getGtfsRouteVariant(routeVariantId?: string) {
  return routeVariantId ? routeByVariantId.get(routeVariantId) : undefined;
}

export function getGtfsStopsForRoute(route: GtfsRouteVariant) {
  return route.stopEntries.map((entry) => stopById.get(entry.stopId)).filter((stop): stop is GtfsStop => Boolean(stop));
}

export function getGtfsStopEntriesForRoute(route: GtfsRouteVariant) {
  return route.stopEntries
    .map((entry) => {
      const stop = stopById.get(entry.stopId);
      return stop ? { stop, sequence: entry.sequence } : undefined;
    })
    .filter((entry): entry is { stop: GtfsStop; sequence: number } => Boolean(entry));
}

export function getGtfsStop(stopId: string) {
  return stopById.get(stopId);
}
