import type { LatLng, TransitLine } from '../types';
import { gtfsNetwork as generatedNetwork } from './gtfsNetwork.generated';

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

export const gtfsNetwork = generatedNetwork as unknown as GtfsNetwork;

const routesByRouteId = new Map<string, GtfsRouteVariant[]>();
const routesByLine = new Map<string, GtfsRouteVariant[]>();
const lineById = new Map<string, GtfsLine>();
const stopById = new Map<string, GtfsStop>();

gtfsNetwork.routes.forEach((route) => {
  routesByRouteId.set(route.routeId, [...(routesByRouteId.get(route.routeId) ?? []), route]);
  routesByLine.set(route.line, [...(routesByLine.get(route.line) ?? []), route]);
});

gtfsNetwork.lines.forEach((line) => lineById.set(line.id, line));
gtfsNetwork.stops.forEach((stop) => stopById.set(stop.id, stop));

export function getGtfsLine(lineId: string) {
  return lineById.get(lineId);
}

export function getGtfsRoutesForLine(lineId?: string) {
  if (!lineId) return gtfsNetwork.routes;
  return routesByLine.get(lineId) ?? [];
}

export function getGtfsRoutesForRouteId(routeId?: string) {
  if (!routeId) return [];
  return routesByRouteId.get(routeId) ?? [];
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
