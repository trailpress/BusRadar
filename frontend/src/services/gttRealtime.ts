import type { Vehicle } from '../types';
import { getGtfsLine } from '../data/gtfsNetwork';

type GttVehiclePosition = {
  routeId: string | null;
  vehicleId: string | null;
  tripId: string | null;
  lat: number | null;
  lon: number | null;
  bearing: number | null;
  speed: number | null;
  timestamp: string | null;
};

type GttVehiclesResponse = {
  status: 'ok' | string;
  entityCount?: number;
  vehiclePositionCount?: number;
  checkedAt?: string;
  vehicles?: GttVehiclePosition[];
  error?: string;
};

type GttTripUpdate = {
  routeId: string | null;
  tripId: string | null;
  vehicleId: string | null;
  timestamp: string | null;
  stopTimeUpdates: Array<{
    stopId: string | null;
    stopSequence: number | null;
    arrivalDelay: number | null;
    arrivalTime: string | null;
    departureDelay: number | null;
    departureTime: string | null;
  }>;
};

type GttTripUpdatesResponse = {
  status: 'ok' | string;
  checkedAt?: string;
  tripUpdates?: GttTripUpdate[];
};

export type GttRealtimeSnapshot = {
  vehicles: Vehicle[];
  entityCount: number;
  vehiclePositionCount: number;
  checkedAt: string;
};

export type GttStopArrival = {
  routeId: string;
  line: string;
  tripId: string;
  vehicleId?: string;
  timeLabel: string;
  minutes: number;
  delaySeconds?: number;
};

export const GTT_REALTIME_API_BASE =
  import.meta.env.VITE_REALTIME_API_BASE ?? 'https://mtuwzlbxhmpnqpaahity.supabase.co/functions/v1/gtt-realtime';

const tramRoutes = new Set(['3', '4', '9', '10', '13', '15', '16']);

function normalizeRouteName(routeId: string) {
  return routeId.replace(/U$/, '');
}

function vehicleTypeForRoute(routeId: string): Vehicle['vehicleType'] {
  const routeName = normalizeRouteName(routeId).replace(/\D/g, '');
  return getGtfsLine(normalizeRouteName(routeId))?.vehicleType ?? (tramRoutes.has(routeName) ? 'tram' : 'bus');
}

function vehicleNumber(vehicleId: string | null) {
  const match = vehicleId?.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function vehicleLengthClass(vehicleId: string | null, vehicleType: Vehicle['vehicleType']): Vehicle['vehicleLengthClass'] {
  if (vehicleType !== 'bus') return 'standard';
  const number = vehicleNumber(vehicleId);
  if (!number) return 'standard';

  // GTT 18m articulated bus series: 800-899 and 9300+ including 9700+.
  return (number >= 800 && number < 900) || number >= 9300 ? 'articulated-18m' : 'standard';
}

let tripUpdatesCache: { at: number; updates: GttTripUpdate[] } | undefined;
let rawVehiclesCache: { at: number; vehicles: GttVehiclePosition[] } | undefined;

async function fetchRawVehicles() {
  if (rawVehiclesCache && Date.now() - rawVehiclesCache.at < 15000) return rawVehiclesCache.vehicles;

  const response = await fetch(`${GTT_REALTIME_API_BASE}/vehicles`);
  if (!response.ok) return [];

  const payload = (await response.json()) as GttVehiclesResponse;
  const vehicles = payload.status === 'ok' && Array.isArray(payload.vehicles) ? payload.vehicles : [];
  rawVehiclesCache = { at: Date.now(), vehicles };
  return vehicles;
}

async function fetchTripUpdates() {
  if (tripUpdatesCache && Date.now() - tripUpdatesCache.at < 15000) return tripUpdatesCache.updates;

  const response = await fetch(`${GTT_REALTIME_API_BASE}/trips`);
  if (!response.ok) return [];

  const payload = (await response.json()) as GttTripUpdatesResponse;
  const updates = payload.status === 'ok' && Array.isArray(payload.tripUpdates) ? payload.tripUpdates : [];
  tripUpdatesCache = { at: Date.now(), updates };
  return updates;
}

export async function fetchGttStopArrivals(
  stopId: string,
  allowedRouteIds: string[] = [],
  stopSequencesByRoute: Record<string, number[]> = {},
): Promise<GttStopArrival[]> {
  const [updates, rawVehicles] = await Promise.all([fetchTripUpdates(), fetchRawVehicles()]);
  const now = Date.now();
  const allowed = new Set(allowedRouteIds.flatMap((routeId) => [routeId, normalizeRouteName(routeId)]));
  const routeByVehicle = new Map(rawVehicles.map((vehicle) => [vehicle.vehicleId, vehicle.routeId]).filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])));

  return updates
    .flatMap((trip) => {
      const routeId = trip.routeId || routeByVehicle.get(trip.vehicleId ?? '') || '';
      const normalizedRouteId = normalizeRouteName(routeId);
      const sequenceSet = new Set([
        ...(stopSequencesByRoute[routeId] ?? []),
        ...(stopSequencesByRoute[normalizedRouteId] ?? []),
        ...(stopSequencesByRoute[`${normalizedRouteId}U`] ?? []),
      ]);

      return trip.stopTimeUpdates
        .filter((stopUpdate) => stopUpdate.stopId === stopId || (routeId && stopUpdate.stopSequence != null && sequenceSet.has(stopUpdate.stopSequence)))
        .filter((stopUpdate) => Number(stopUpdate.arrivalTime ?? stopUpdate.departureTime ?? 0) > 0)
        .map((stopUpdate) => {
          const seconds = Number(stopUpdate.arrivalTime ?? stopUpdate.departureTime ?? 0);
          const time = seconds > 0 ? seconds * 1000 : now;
          const delaySeconds = stopUpdate.arrivalDelay ?? stopUpdate.departureDelay ?? undefined;

          return {
            routeId,
            line: normalizedRouteId,
            tripId: trip.tripId ?? '-',
            vehicleId: trip.vehicleId ?? undefined,
            timeLabel: new Date(time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
            minutes: Math.max(0, Math.round((time - now) / 60000)),
            delaySeconds,
          };
        });
    })
    .filter((arrival) => allowed.size === 0 || allowed.has(arrival.routeId) || allowed.has(normalizeRouteName(arrival.routeId)))
    .filter((arrival) => arrival.minutes <= 90)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 8);
}

function formatTimestamp(timestamp: string | null) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  return new Date(seconds * 1000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function speedKmh(speedMetersPerSecond: number | null) {
  if (!Number.isFinite(speedMetersPerSecond)) return 0;
  return Math.max(0, Math.round((speedMetersPerSecond ?? 0) * 3.6));
}

function isValidTorinoCoordinate(vehicle: GttVehiclePosition) {
  return (
    typeof vehicle.lat === 'number' &&
    typeof vehicle.lon === 'number' &&
    vehicle.lat > 44.7 &&
    vehicle.lat < 45.3 &&
    vehicle.lon > 7.3 &&
    vehicle.lon < 8.1
  );
}

function toVehicle(vehicle: GttVehiclePosition, index: number): Vehicle {
  const routeId = vehicle.routeId || 'GTT';
  const line = normalizeRouteName(routeId);
  const speed = speedKmh(vehicle.speed);
  const gtfsLine = getGtfsLine(line);
  const vehicleType = vehicleTypeForRoute(routeId);

  return {
    vehicleId: vehicle.vehicleId || `GTT-${index}`,
    routeId: `gtt-${routeId}`,
    routeShortName: line,
    vehicleType,
    vehicleLengthClass: vehicleLengthClass(vehicle.vehicleId, vehicleType),
    lat: vehicle.lat ?? 0,
    lon: vehicle.lon ?? 0,
    bearing: vehicle.bearing ?? 0,
    speed,
    updatedAt: formatTimestamp(vehicle.timestamp),
    source: 'gtfs-rt',
    status: speed > 1 ? 'moving' : 'unknown',
    line,
    lineId: line,
    direction: gtfsLine?.direction ?? `Linea ${line}`,
    reliability: 100,
    progress: 0,
    nextStop: vehicle.tripId ? `Trip ${vehicle.tripId}` : undefined,
  };
}

export async function fetchGttRealtimeVehicles(): Promise<GttRealtimeSnapshot | undefined> {
  let response: Response;
  try {
    response = await fetch(`${GTT_REALTIME_API_BASE}/vehicles`);
  } catch {
    return undefined;
  }

  if (!response.ok) return undefined;

  const payload = (await response.json()) as GttVehiclesResponse;
  if (payload.status !== 'ok' || !Array.isArray(payload.vehicles)) return undefined;

  const vehicles = payload.vehicles.filter(isValidTorinoCoordinate).map(toVehicle);
  if (vehicles.length === 0) return undefined;

  return {
    vehicles,
    entityCount: payload.entityCount ?? vehicles.length,
    vehiclePositionCount: payload.vehiclePositionCount ?? vehicles.length,
    checkedAt: payload.checkedAt ?? new Date().toISOString(),
  };
}
