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
const lineByCodeKey = new Map<string, GtfsLine>();
const stopById = new Map<string, GtfsStop>();
const listeners = new Set<() => void>();
let revision = 0;
let loadPromise: Promise<GtfsNetwork> | undefined;
let loaded = false;
// The ground the network actually covers, measured from its own stops. Written
// by hand it was wrong: the box in use accepted 44,7-45,35 by 7,25-8,15 while
// the network reaches Ivrea, the Susa valley and Asti, so a fifth of the stops
// lay outside it and every interurban vehicle out there was discarded before it
// could be drawn.
let networkBounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } | undefined;

// Il ripiego finché la rete non è caricata: largo quanto il Piemonte, perché il
// suo compito è respingere solo le assurdità — una posizione a 0,0, un punto
// dichiarato in un altro paese — e nulla di più fine.
export const PIEDMONT_FALLBACK_BOUNDS = { minLat: 44.0, maxLat: 46.2, minLon: 6.5, maxLon: 9.4 };

export function getGtfsNetworkBounds() {
  return networkBounds;
}

/**
 * Lo stesso numero di linea si scrive in più modi, e chi arriva da fuori non
 * usa per forza quello del GTFS. Il barrato è `63/` qui e `63B` per chi lo
 * scrive a mano o lo digita su un turno; una linea notturna è `N04` qui e `N4`
 * altrove; gli zeri iniziali e gli spazi non contano. La chiave li riduce tutti
 * alla stessa forma — verificato sulle 223 linee pubblicate: nessuna coppia di
 * linee diverse ci finisce sopra.
 *
 * Il `+` **resta**: `13` e `13+` sono due linee distinte, e fonderle
 * mostrerebbe i mezzi di un'altra.
 */
function lineCodeKey(code: string) {
  return code
    .toUpperCase()
    .replace(/[\s.()]/g, '')
    .replace(/\/+$/, 'B')
    .replace(/\d+/g, (digits) => String(Number(digits)));
}

/**
 * La linea GTFS a cui corrisponde un codice scritto altrove. Nell'ordine:
 * l'id esatto, la stessa linea scritta in un altro modo, e infine la linea
 * madre di una variante di turno — `36 (merc.)` e `M1N` non sono linee del
 * GTFS, ma i mezzi che le fanno il feed li dichiara sulla 36 e sulla M1.
 *
 * L'ultimo passo è una **convenzione dichiarata**, non un dato: si ferma alla
 * linea madre, e se nemmeno quella esiste restituisce `undefined` invece di
 * indovinare. Chi chiama deve trattare `undefined` come «non lo so»: filtrare
 * per un codice che nessun mezzo porta svuota la mappa, e una mappa vuota si
 * legge come «non sta circolando niente».
 */
export function findGtfsLineByCode(code: string | undefined) {
  const trimmed = code?.trim();
  if (!trimmed) return undefined;
  const exact = lineById.get(trimmed);
  if (exact) return exact;
  const byKey = lineByCodeKey.get(lineCodeKey(trimmed));
  if (byKey) return byKey;
  const parent = trimmed.toUpperCase().replace(/_.*$/, '').replace(/[A-Z]+$/, '');
  if (!parent || !/\d$/.test(parent)) return undefined;
  return lineByCodeKey.get(lineCodeKey(parent));
}

function rebuildIndexes() {
  routesByRouteId.clear();
  routesByLine.clear();
  routeByVariantId.clear();
  lineById.clear();
  lineByCodeKey.clear();
  stopById.clear();

  gtfsNetwork.routes.forEach((route) => {
    routeByVariantId.set(route.id, route);
    routesByRouteId.set(route.routeId, [...(routesByRouteId.get(route.routeId) ?? []), route]);
    routesByLine.set(route.line, [...(routesByLine.get(route.line) ?? []), route]);
  });
  gtfsNetwork.lines.forEach((line) => {
    lineById.set(line.id, line);
    // Il primo che occupa la chiave la tiene: l'id esatto viene comunque
    // provato prima, quindi questa serve solo a chi scrive la linea altrimenti.
    if (!lineByCodeKey.has(lineCodeKey(line.id))) lineByCodeKey.set(lineCodeKey(line.id), line);
  });
  gtfsNetwork.stops.forEach((stop) => stopById.set(stop.id, stop));

  networkBounds = undefined;
  for (const stop of gtfsNetwork.stops) {
    networkBounds = networkBounds
      ? {
          minLat: Math.min(networkBounds.minLat, stop.lat),
          maxLat: Math.max(networkBounds.maxLat, stop.lat),
          minLon: Math.min(networkBounds.minLon, stop.lon),
          maxLon: Math.max(networkBounds.maxLon, stop.lon),
        }
      : { minLat: stop.lat, maxLat: stop.lat, minLon: stop.lon, maxLon: stop.lon };
  }
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
