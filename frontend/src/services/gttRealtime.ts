import type { Vehicle } from '../types';
import { getGtfsLine, getGtfsRoutesForLine, getGtfsRoutesForRouteId } from '../data/gtfsNetwork';
import { distanceMeters, routeProgressAtPoint } from '../utils/geo';

type GttVehiclePosition = {
  entityId?: string | null;
  routeId: string | null;
  vehicleId: string | null;
  vehicleLabel?: string | null;
  licensePlate?: string | null;
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
  vehicleLabel?: string | null;
  licensePlate?: string | null;
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
  source: 'realtime' | 'scheduled';
};

type StopTimeIndex = {
  calendar?: {
    services: Record<string, {
      startDate: string;
      endDate: string;
      days: number[];
    }>;
    exceptions: Record<string, Record<string, number>>;
  };
  trips: Record<string, {
    routeId: string;
    line: string;
    serviceId?: string;
    stops: Array<[number, string, number?, number?]>;
  }>;
};

export const GTT_REALTIME_API_BASE =
  import.meta.env.VITE_REALTIME_API_BASE ?? 'https://mtuwzlbxhmpnqpaahity.supabase.co/functions/v1/gtt-realtime';

const tramRoutes = new Set(['3', '4', '9', '10', '13', '15', '16']);

function normalizeRouteName(routeId: string) {
  return routeId.replace(/U$/, '');
}

function normalizeVehicleId(vehicleId: string | null) {
  return vehicleId?.replace(/U$/, '') ?? '';
}

function normalizeOptionalVehicleId(vehicleId?: string | null) {
  const normalized = normalizeVehicleId(vehicleId ?? null);
  return normalized || undefined;
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

  // GTT 18m articulated bus series: 800-899 and 1300+.
  return (number >= 800 && number < 900) || number >= 1300 ? 'articulated-18m' : 'standard';
}

function vehicleLiveryForVehicle(routeId: string, line: string, vehicleId: string | null): Vehicle['vehicleLivery'] {
  const number = vehicleNumber(vehicleId);
  if (number && number >= 50 && number <= 81) return 'electric-compact';

  const routeNumber = Number(normalizeRouteName(routeId).replace(/\D/g, '') || line.replace(/\D/g, ''));
  return routeNumber >= 1000 ? 'interurban-blue' : 'urban';
}

let tripUpdatesCache: { at: number; updates: GttTripUpdate[] } | undefined;
let rawVehiclesCache: { at: number; vehicles: GttVehiclePosition[] } | undefined;
let stopTimeIndexCache: Promise<StopTimeIndex | undefined> | undefined;
const previousSamples = new Map<string, { lat: number; lon: number; timestampMs: number; speed: number }>();

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

function fetchStopTimeIndex() {
  stopTimeIndexCache ??= fetch(`${import.meta.env.BASE_URL}assets/gtfs-stop-times.json`)
    .then((response) => (response.ok ? response.json() as Promise<StopTimeIndex> : undefined))
    .catch(() => undefined);
  return stopTimeIndexCache;
}

function localGtfsDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function serviceRunsToday(serviceId: string | undefined, index: StopTimeIndex | undefined, date: Date) {
  if (!serviceId || !index?.calendar) return true;

  const dayKey = localGtfsDate(date);
  const exception = index.calendar.exceptions[dayKey]?.[serviceId];
  if (exception === 1) return true;
  if (exception === 2) return false;

  const service = index.calendar.services[serviceId];
  if (!service) return true;
  return dayKey >= service.startDate && dayKey <= service.endDate && service.days[date.getDay()] === 1;
}

function scheduledStopArrivals(
  stopId: string,
  allowedRouteIds: string[],
  stopSequencesByRoute: Record<string, number[]>,
  stopTimeIndex: StopTimeIndex | undefined,
): GttStopArrival[] {
  if (!stopTimeIndex) return [];

  const now = new Date();
  const secondsNow = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const allowed = new Set(allowedRouteIds.flatMap((routeId) => [routeId, normalizeRouteName(routeId)]));
  const maxHorizonSeconds = secondsNow + 4 * 3600;

  return Object.entries(stopTimeIndex.trips)
    .flatMap(([tripId, trip]) => {
      if (!serviceRunsToday(trip.serviceId, stopTimeIndex, now)) return [];

      const normalizedRouteId = normalizeRouteName(trip.line || trip.routeId);
      if (allowed.size > 0 && !allowed.has(trip.routeId) && !allowed.has(normalizedRouteId)) return [];

      const sequenceSet = new Set([
        ...(stopSequencesByRoute[trip.routeId] ?? []),
        ...(stopSequencesByRoute[normalizedRouteId] ?? []),
        ...(stopSequencesByRoute[`${normalizedRouteId}U`] ?? []),
      ]);
      const stopEntries = trip.stops.filter(([sequence, staticStopId]) => staticStopId === stopId || sequenceSet.has(sequence));

      return stopEntries
        .map(([sequence, , departureSeconds = -1, arrivalSeconds = -1]) => {
          const seconds = departureSeconds >= 0 ? departureSeconds : arrivalSeconds;
          if (seconds < secondsNow || seconds > maxHorizonSeconds) return undefined;
          const minutes = Math.max(0, Math.round((seconds - secondsNow) / 60));
          const displaySeconds = seconds % 86400;
          const time = new Date(now);
          time.setHours(Math.floor(displaySeconds / 3600), Math.floor((displaySeconds % 3600) / 60), 0, 0);

          return {
            routeId: trip.routeId,
            line: normalizedRouteId,
            tripId,
            timeLabel: time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
            minutes,
            source: 'scheduled' as const,
            delaySeconds: undefined,
            vehicleId: undefined,
            sequence,
          };
        })
        .filter((arrival): arrival is NonNullable<typeof arrival> => Boolean(arrival));
    })
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 8);
}

export async function fetchGttStopArrivals(
  stopId: string,
  allowedRouteIds: string[] = [],
  stopSequencesByRoute: Record<string, number[]> = {},
): Promise<GttStopArrival[]> {
  const [updates, rawVehicles, stopTimeIndex] = await Promise.all([fetchTripUpdates(), fetchRawVehicles(), fetchStopTimeIndex()]);
  const now = Date.now();
  const allowed = new Set(allowedRouteIds.flatMap((routeId) => [routeId, normalizeRouteName(routeId)]));
  const routeByVehicle = new Map(rawVehicles.map((vehicle) => [vehicle.vehicleId, vehicle.routeId]).filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])));

  const realtimeArrivals = updates
    .flatMap((trip) => {
      const routeId = trip.routeId || routeByVehicle.get(trip.vehicleId ?? '') || '';
      const staticTrip = trip.tripId ? stopTimeIndex?.trips[trip.tripId] : undefined;
      const resolvedRouteId = routeId || staticTrip?.routeId || '';
      const normalizedRouteId = normalizeRouteName(staticTrip?.line || resolvedRouteId);
      const sequenceSet = new Set([
        ...(stopSequencesByRoute[resolvedRouteId] ?? []),
        ...(stopSequencesByRoute[normalizedRouteId] ?? []),
        ...(stopSequencesByRoute[`${normalizedRouteId}U`] ?? []),
      ]);

      return trip.stopTimeUpdates
        .filter((stopUpdate) => {
          if (stopUpdate.stopId === stopId) return true;
          if (stopUpdate.stopSequence == null) return false;
          const staticStopId = staticTrip?.stops.find(([sequence]) => sequence === stopUpdate.stopSequence)?.[1];
          return staticStopId === stopId || (resolvedRouteId && sequenceSet.has(stopUpdate.stopSequence));
        })
        .filter((stopUpdate) => Number(stopUpdate.arrivalTime ?? stopUpdate.departureTime ?? 0) > 0)
        .map((stopUpdate) => {
          const seconds = Number(stopUpdate.arrivalTime ?? stopUpdate.departureTime ?? 0);
          const time = seconds > 0 ? seconds * 1000 : now;
          const delaySeconds = stopUpdate.arrivalDelay ?? stopUpdate.departureDelay ?? undefined;

          return {
            routeId: resolvedRouteId,
            line: normalizedRouteId,
            tripId: trip.tripId ?? '-',
            vehicleId: normalizeVehicleId(trip.vehicleId) || undefined,
            timeLabel: new Date(time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
            minutes: Math.max(0, Math.round((time - now) / 60000)),
            delaySeconds,
            source: 'realtime' as const,
          };
        });
    })
    .filter((arrival) => allowed.size === 0 || allowed.has(arrival.routeId) || allowed.has(normalizeRouteName(arrival.routeId)))
    .filter((arrival) => arrival.minutes <= 90)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 8);

  return realtimeArrivals.length > 0
    ? realtimeArrivals
    : scheduledStopArrivals(stopId, allowedRouteIds, stopSequencesByRoute, stopTimeIndex);
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

function timestampMs(timestamp: string | null) {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now();
}

function observedSpeed(vehicleId: string, vehicle: GttVehiclePosition) {
  if (typeof vehicle.lat !== 'number' || typeof vehicle.lon !== 'number') return { speed: 0, source: 'unavailable' as const };

  const feedSpeed = speedKmh(vehicle.speed);
  const sampleTime = timestampMs(vehicle.timestamp);
  const previous = previousSamples.get(vehicleId);
  let speed = feedSpeed;
  let source: Vehicle['speedSource'] = feedSpeed > 0 ? 'feed' : 'unavailable';

  if ((!speed || speed < 1) && previous) {
    const elapsedSeconds = Math.max(0, (sampleTime - previous.timestampMs) / 1000);
    const meters = distanceMeters({ lat: previous.lat, lon: previous.lon }, { lat: vehicle.lat, lon: vehicle.lon });
    if (elapsedSeconds >= 5 && elapsedSeconds <= 180 && meters < 5000) {
      const calculated = Math.round((meters / elapsedSeconds) * 3.6);
      if (calculated > 0 && calculated < 90) {
        speed = calculated;
        source = 'observed';
      }
    }
  }

  previousSamples.set(vehicleId, {
    lat: vehicle.lat,
    lon: vehicle.lon,
    timestampMs: sampleTime,
    speed,
  });

  return { speed, source };
}

function terminalEstimate(routeId: string, line: string, point: { lat: number; lon: number }, speed: number) {
  const routes = getGtfsRoutesForRouteId(routeId).length > 0 ? getGtfsRoutesForRouteId(routeId) : getGtfsRoutesForLine(line);
  const candidates = routes
    .map((route) => {
      const progress = routeProgressAtPoint(route.path, point);
      if (!progress) return undefined;
      return {
        route,
        progress,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => a.progress.distanceMeters - b.progress.distanceMeters);

  const best = candidates[0];
  if (!best) return {};

  const effectiveSpeed = speed >= 3 ? speed : 14;
  const etaMinutes = Math.max(1, Math.round((best.progress.remainingMeters / 1000 / effectiveSpeed) * 60));
  const etaTime = new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  return {
    terminalName: best.route.headsign || `Linea ${line}`,
    etaTerminalMinutes: etaMinutes,
    etaTerminalTimeLabel: etaTime,
    remainingKm: Math.round((best.progress.remainingMeters / 1000) * 10) / 10,
    bearing: best.progress.bearing,
    snappedPoint: best.progress.projectedPoint,
    offRouteMeters: Math.round(best.progress.distanceMeters),
  };
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
  const gtfsLine = getGtfsLine(line);
  const vehicleType = vehicleTypeForRoute(routeId);
  const vehicleLivery = vehicleLiveryForVehicle(routeId, line, vehicle.vehicleId);
  const vehicleId = normalizeVehicleId(vehicle.vehicleId) || normalizeVehicleId(vehicle.vehicleLabel ?? null);
  const vehicleIdSource: Vehicle['vehicleIdSource'] = normalizeVehicleId(vehicle.vehicleId) ? 'vehicle.id' : 'vehicle.label';
  const { speed, source: speedSource } = observedSpeed(vehicleId || String(index), vehicle);
  const rawPoint = { lat: vehicle.lat ?? 0, lon: vehicle.lon ?? 0 };
  const estimate = terminalEstimate(routeId, line, rawPoint, speed);
  const snapLimitMeters = vehicleLivery === 'interurban-blue' ? 260 : 120;
  const isSnappedToRoute = Boolean(estimate.snappedPoint && estimate.offRouteMeters != null && estimate.offRouteMeters <= snapLimitMeters);
  const displayPoint = isSnappedToRoute ? estimate.snappedPoint! : rawPoint;

  return {
    vehicleId,
    realtimeEntityId: normalizeOptionalVehicleId(vehicle.entityId),
    realtimeVehicleId: normalizeOptionalVehicleId(vehicle.vehicleId),
    realtimeVehicleLabel: normalizeOptionalVehicleId(vehicle.vehicleLabel),
    licensePlate: vehicle.licensePlate || undefined,
    vehicleIdSource,
    routeId: `gtt-${routeId}`,
    routeShortName: line,
    vehicleType,
    vehicleLivery,
    vehicleLengthClass: vehicleLengthClass(vehicle.vehicleId, vehicleType),
    lat: displayPoint.lat,
    lon: displayPoint.lon,
    bearing: isSnappedToRoute ? estimate.bearing ?? 0 : vehicle.bearing && vehicle.bearing > 0 ? vehicle.bearing : estimate.bearing ?? 0,
    speed,
    speedSource,
    updatedAt: formatTimestamp(vehicle.timestamp),
    source: 'gtfs-rt',
    status: speed > 1 ? 'moving' : 'unknown',
    line,
    lineId: line,
    direction: gtfsLine?.direction ?? `Linea ${line}`,
    reliability: 100,
    progress: 0,
    nextStop: estimate.terminalName ?? (vehicle.tripId ? `Trip ${vehicle.tripId}` : undefined),
    terminalName: estimate.terminalName,
    etaTerminalMinutes: estimate.etaTerminalMinutes,
    etaTerminalTimeLabel: estimate.etaTerminalTimeLabel,
    remainingKm: estimate.remainingKm,
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

  const vehicles = payload.vehicles
    .filter((vehicle) => vehicle.vehicleId || vehicle.vehicleLabel)
    .filter(isValidTorinoCoordinate)
    .map(toVehicle);
  if (vehicles.length === 0) return undefined;

  return {
    vehicles,
    entityCount: payload.entityCount ?? vehicles.length,
    vehiclePositionCount: payload.vehiclePositionCount ?? vehicles.length,
    checkedAt: payload.checkedAt ?? new Date().toISOString(),
  };
}
