import type { Vehicle } from '../types';
import { getGtfsLine, getGtfsRouteVariant, getGtfsRoutesForLine, getGtfsRoutesForRouteId, loadGtfsNetwork } from '../data/gtfsNetwork';
import { bearingDegrees, distanceMeters, interpolatePathState, routeProgressAtPoint } from '../utils/geo';

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

export type GttStopArrivalsResult = {
  arrivals: GttStopArrival[];
  source: 'realtime' | 'scheduled' | 'mixed' | 'unavailable';
  checkedAt: string;
  realtimeCount: number;
  scheduledCount: number;
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
const vehicleSnapshotCacheKey = 'busradar:last-valid-vehicle-snapshot';

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

function publicFleetNumber(vehicleId: string) {
  return /^\d{1,4}$/.test(vehicleId) ? vehicleId : undefined;
}

function vehicleTypeForRoute(routeId: string): Vehicle['vehicleType'] {
  const routeName = normalizeRouteName(routeId).replace(/\D/g, '');
  return getGtfsLine(normalizeRouteName(routeId))?.vehicleType ?? (tramRoutes.has(routeName) ? 'tram' : 'bus');
}

function vehicleNumber(vehicleId: string | null) {
  const match = vehicleId?.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function isVehicleNumberInRange(vehicleId: string | null, min: number, max: number) {
  const number = vehicleNumber(vehicleId);
  return Boolean(number && number >= min && number <= max);
}

function isBydElectric12m(vehicleId: string | null) {
  return isVehicleNumberInRange(vehicleId, 30, 49) || isVehicleNumberInRange(vehicleId, 9000, 9121);
}

function isMethane12m(vehicleId: string | null) {
  return isVehicleNumberInRange(vehicleId, 9200, 9261);
}

function isIveco12m(vehicleId: string | null) {
  return isVehicleNumberInRange(vehicleId, 3000, 3099);
}

function isMercedes12m(vehicleId: string | null) {
  return isVehicleNumberInRange(vehicleId, 2400, 2499);
}

function isArticulated18m(vehicleId: string | null) {
  return (
    isVehicleNumberInRange(vehicleId, 790, 797) ||
    isVehicleNumberInRange(vehicleId, 800, 874) ||
    isVehicleNumberInRange(vehicleId, 1310, 1313) ||
    isVehicleNumberInRange(vehicleId, 1350, 1396) ||
    isVehicleNumberInRange(vehicleId, 1400, 1404) ||
    isVehicleNumberInRange(vehicleId, 9300, 9356) ||
    isVehicleNumberInRange(vehicleId, 9600, 9727)
  );
}

function vehicleFleetKey(vehicleId: string | null, vehicleType: Vehicle['vehicleType']): Vehicle['vehicleFleetKey'] {
  if (vehicleType === 'tram') {
    if (isVehicleNumberInRange(vehicleId, 2800, 2902)) return 'tram-serie-2800';
    if (isVehicleNumberInRange(vehicleId, 5000, 5053)) return 'tram-serie-5000';
    if (isVehicleNumberInRange(vehicleId, 6000, 6054)) return 'tram-serie-6000';
    if (isVehicleNumberInRange(vehicleId, 8001, 8070)) return 'tram-serie-8000';
    return 'tram-serie-5000';
  }
  if (isVehicleNumberInRange(vehicleId, 50, 57)) return 'byd-k7-electric-9m';
  if (isVehicleNumberInRange(vehicleId, 60, 81)) return 'indcar-eb6-electric-6m';
  if (isVehicleNumberInRange(vehicleId, 110, 115)) return 'bmc-neocity-9m';
  if (isBydElectric12m(vehicleId)) return 'byd-k9-electric-12m';
  if (isMethane12m(vehicleId)) return 'iia-citymood-cng-12m';
  if (isVehicleNumberInRange(vehicleId, 3000, 3380)) return 'iveco-citelis-12m';
  if (isVehicleNumberInRange(vehicleId, 3400, 3440)) return 'mercedes-conecto-12m';
  if (isMercedes12m(vehicleId)) return 'mercedes-conecto-12m';
  if (isVehicleNumberInRange(vehicleId, 9400, 9535)) return 'iveco-eway-electric-12m';
  if (isVehicleNumberInRange(vehicleId, 1150, 1168)) return 'iveco-crossway-suburban';
  if (isVehicleNumberInRange(vehicleId, 1310, 1313)) return 'irisbus-citelis-18m';
  if (isVehicleNumberInRange(vehicleId, 1350, 1396)) return 'mercedes-conecto-18m';
  if (isVehicleNumberInRange(vehicleId, 1400, 1404)) return 'man-lions-city-19c-cng';
  if (isVehicleNumberInRange(vehicleId, 9600, 9727)) return 'iveco-eway-electric-18m';
  if (isVehicleNumberInRange(vehicleId, 9300, 9356)) return 'iveco-urbanway-cng-18m';
  if (isVehicleNumberInRange(vehicleId, 790, 797) || isVehicleNumberInRange(vehicleId, 800, 874)) return 'irisbus-citelis-18m';
  if (isVehicleNumberInRange(vehicleId, 230, 241)) return 'irisbus-crossway-11m';
  if (isVehicleNumberInRange(vehicleId, 320, 365)) return 'irisbus-crossway-12m';
  if (isVehicleNumberInRange(vehicleId, 366, 406) || isVehicleNumberInRange(vehicleId, 601, 650)) return 'iveco-crossway-line-12m';
  if (isVehicleNumberInRange(vehicleId, 651, 692)) return 'iveco-crossway-line-cng-12m';
  if (isVehicleNumberInRange(vehicleId, 500, 502)) return 'irisbus-arway-15m';
  if (isVehicleNumberInRange(vehicleId, 19, 20)) return 'iveco-mago-granturismo-9m';
  return 'generic-bus';
}

function vehicleLengthClass(vehicleId: string | null, vehicleType: Vehicle['vehicleType']): Vehicle['vehicleLengthClass'] {
  if (vehicleType !== 'bus') return 'standard';
  return isArticulated18m(vehicleId) ? 'articulated-18m' : 'standard';
}

function vehicleLiveryForVehicle(routeId: string, line: string, vehicleId: string | null): Vehicle['vehicleLivery'] {
  const number = vehicleNumber(vehicleId);
  if (isBydElectric12m(vehicleId)) return 'electric-compact';
  if (isVehicleNumberInRange(vehicleId, 9400, 9727)) return 'electric-compact';
  if (number && number >= 50 && number <= 81) return 'electric-compact';

  const routeNumber = Number(normalizeRouteName(routeId).replace(/\D/g, '') || line.replace(/\D/g, ''));
  return routeNumber >= 1000 ? 'interurban-blue' : 'urban';
}

function vehicleFleetLabel(vehicleId: string | null, vehicleType: Vehicle['vehicleType'], livery?: Vehicle['vehicleLivery'], lengthClass?: Vehicle['vehicleLengthClass']) {
  if (vehicleType === 'tram') {
    if (isVehicleNumberInRange(vehicleId, 2800, 2902)) return 'Tram serie 2800';
    if (isVehicleNumberInRange(vehicleId, 5000, 5053)) return 'Tram serie 5000';
    if (isVehicleNumberInRange(vehicleId, 6000, 6054)) return 'Tram serie 6000 Cityway';
    if (isVehicleNumberInRange(vehicleId, 8001, 8070)) return 'Tram serie 8000 Hitachi';
    return 'Tram';
  }
  if (isVehicleNumberInRange(vehicleId, 9300, 9356)) return 'Iveco Urbanway 18m CNG';
  if (isVehicleNumberInRange(vehicleId, 9600, 9727)) return 'Iveco E-Way 18m elettrico';
  if (isVehicleNumberInRange(vehicleId, 9400, 9535)) return 'Iveco E-Way 12m elettrico';
  if (isBydElectric12m(vehicleId)) return 'BYD elettrico 12m';
  if (isVehicleNumberInRange(vehicleId, 50, 57)) return 'BYD K7 elettrico 9m';
  if (isVehicleNumberInRange(vehicleId, 60, 81)) return 'INDCAR e-B6 elettrico 6m';
  if (isVehicleNumberInRange(vehicleId, 110, 115)) return 'BMC Neocity 9m';
  if (isMethane12m(vehicleId)) return 'IIA Citymood CNG 12m';
  if (isIveco12m(vehicleId)) return 'Irisbus/Iveco Citelis 12m';
  if (isVehicleNumberInRange(vehicleId, 790, 797) || isVehicleNumberInRange(vehicleId, 800, 874)) return 'Irisbus Citelis 18m';
  if (isVehicleNumberInRange(vehicleId, 1310, 1313)) return 'Irisbus Citelis 18m CNG';
  if (isVehicleNumberInRange(vehicleId, 1350, 1396)) return 'Mercedes Conecto 18m';
  if (isVehicleNumberInRange(vehicleId, 1400, 1404)) return "MAN Lion's City 19C CNG";
  if (isMercedes12m(vehicleId) || isVehicleNumberInRange(vehicleId, 3400, 3440)) return 'Mercedes Conecto 12m';
  if (isVehicleNumberInRange(vehicleId, 1150, 1168)) return 'Iveco Crossway suburbano';
  if (isVehicleNumberInRange(vehicleId, 230, 241)) return 'Irisbus Crossway 10,6m';
  if (isVehicleNumberInRange(vehicleId, 320, 365)) return 'Irisbus Crossway 12m';
  if (isVehicleNumberInRange(vehicleId, 366, 406) || isVehicleNumberInRange(vehicleId, 601, 650)) return 'Iveco Crossway Line 12m';
  if (isVehicleNumberInRange(vehicleId, 651, 692)) return 'Iveco Crossway Line CNG 12m';
  if (isVehicleNumberInRange(vehicleId, 500, 502)) return 'Irisbus Arway 15m';
  if (isVehicleNumberInRange(vehicleId, 19, 20)) return 'Iveco Mago 2 granturismo';
  if (livery === 'electric-compact') return 'Bus elettrico';
  if (livery === 'interurban-blue') return lengthClass === 'articulated-18m' ? 'Bus suburbano blu 18m' : 'Bus suburbano blu';
  return lengthClass === 'articulated-18m' ? 'Bus 18m' : 'Bus';
}

let tripUpdatesCache: { at: number; updates: GttTripUpdate[] } | undefined;
let rawVehiclesCache: { at: number; vehicles: GttVehiclePosition[] } | undefined;
let stopTimeIndexCache: Promise<StopTimeIndex | undefined> | undefined;
const previousSamples = new Map<string, { lat: number; lon: number; timestampMs: number; speed: number }>();
const previousRouteVariants = new Map<string, string>();

async function fetchRawVehicles() {
  if (rawVehiclesCache && Date.now() - rawVehiclesCache.at < 6000) return rawVehiclesCache.vehicles;

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
  const maxHorizonSeconds = secondsNow + 30 * 3600;
  const serviceDays = [-1, 0, 1, 2].map((dayOffset) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    return { date, dayOffset };
  });

  const candidates = Object.entries(stopTimeIndex.trips)
    .flatMap(([tripId, trip]) => {
      const normalizedRouteId = normalizeRouteName(trip.line || trip.routeId);
      if (allowed.size > 0 && !allowed.has(trip.routeId) && !allowed.has(normalizedRouteId)) return [];

      const sequenceSet = new Set([
        ...(stopSequencesByRoute[trip.routeId] ?? []),
        ...(stopSequencesByRoute[normalizedRouteId] ?? []),
        ...(stopSequencesByRoute[`${normalizedRouteId}U`] ?? []),
      ]);
      const stopEntries = trip.stops.filter(([sequence, staticStopId]) => staticStopId === stopId || sequenceSet.has(sequence));

      return serviceDays.flatMap(({ date, dayOffset }) => {
        if (!serviceRunsToday(trip.serviceId, stopTimeIndex, date)) return [];

        return stopEntries
          .map(([sequence, , departureSeconds = -1, arrivalSeconds = -1]) => {
            const tripSeconds = departureSeconds >= 0 ? departureSeconds : arrivalSeconds;
            if (tripSeconds < 0) return undefined;
            const absoluteSeconds = dayOffset * 86400 + tripSeconds;
            if (absoluteSeconds < secondsNow || absoluteSeconds > maxHorizonSeconds) return undefined;

            const minutes = Math.max(0, Math.round((absoluteSeconds - secondsNow) / 60));
            const time = new Date(now);
            time.setHours(0, 0, 0, 0);
            time.setSeconds(absoluteSeconds);

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
      });
    })
    .sort((a, b) => a.minutes - b.minutes);

  const earliestByLine = new Map<string, GttStopArrival>();
  candidates.forEach((arrival) => {
    if (!earliestByLine.has(arrival.line)) earliestByLine.set(arrival.line, arrival);
  });
  const selected = [...earliestByLine.values()];
  const selectedTrips = new Set(selected.map((arrival) => `${arrival.tripId}:${arrival.timeLabel}`));
  candidates.forEach((arrival) => {
    if (selected.length >= 16) return;
    const key = `${arrival.tripId}:${arrival.timeLabel}`;
    if (!selectedTrips.has(key)) {
      selected.push(arrival);
      selectedTrips.add(key);
    }
  });
  return selected.sort((a, b) => a.minutes - b.minutes).slice(0, 16);
}

export async function fetchGttStopArrivals(
  stopId: string,
  allowedRouteIds: string[] = [],
  stopSequencesByRoute: Record<string, number[]> = {},
): Promise<GttStopArrival[]> {
  const result = await fetchGttStopArrivalsInfo(stopId, allowedRouteIds, stopSequencesByRoute);
  return result.arrivals;
}

export async function fetchGttStopArrivalsInfo(
  stopId: string,
  allowedRouteIds: string[] = [],
  stopSequencesByRoute: Record<string, number[]> = {},
): Promise<GttStopArrivalsResult> {
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

  const scheduledArrivals = scheduledStopArrivals(stopId, allowedRouteIds, stopSequencesByRoute, stopTimeIndex);
  const realtimeLines = new Set(realtimeArrivals.map((arrival) => arrival.line));
  const scheduledFallbacks = scheduledArrivals.filter((arrival) => !realtimeLines.has(arrival.line));
  const arrivals = [...realtimeArrivals, ...scheduledFallbacks]
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 16);
  const source = realtimeArrivals.length > 0
    ? scheduledFallbacks.length > 0 ? 'mixed' : 'realtime'
    : scheduledArrivals.length > 0 ? 'scheduled' : 'unavailable';

  return {
    arrivals,
    source,
    checkedAt: new Date(now).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    realtimeCount: realtimeArrivals.length,
    scheduledCount: scheduledArrivals.length,
  };
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

function feedAgeSeconds(timestamp: string | null) {
  return Math.max(0, Math.round((Date.now() - timestampMs(timestamp)) / 1000));
}

function observedSpeed(vehicleId: string, vehicle: GttVehiclePosition) {
  if (typeof vehicle.lat !== 'number' || typeof vehicle.lon !== 'number') return { speed: 0, source: 'unavailable' as const, bearing: undefined };

  const feedSpeed = speedKmh(vehicle.speed);
  const sampleTime = timestampMs(vehicle.timestamp);
  const previous = previousSamples.get(vehicleId);
  let speed = feedSpeed;
  let source: Vehicle['speedSource'] = feedSpeed > 0 ? 'feed' : 'unavailable';
  let observedBearing: number | undefined;

  if (previous) {
    const elapsedSeconds = Math.max(0, (sampleTime - previous.timestampMs) / 1000);
    const meters = distanceMeters({ lat: previous.lat, lon: previous.lon }, { lat: vehicle.lat, lon: vehicle.lon });
    if (meters >= 8 && elapsedSeconds >= 5 && elapsedSeconds <= 180) {
      observedBearing = bearingDegrees({ lat: previous.lat, lon: previous.lon }, { lat: vehicle.lat, lon: vehicle.lon });
    }
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

  return { speed, source, bearing: observedBearing };
}

function bearingDelta(a?: number, b?: number) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

function terminalEstimate(
  routeId: string,
  line: string,
  point: { lat: number; lon: number },
  speed: number,
  preferredBearing?: number,
  previousRouteVariantId?: string,
) {
  const routes = getGtfsRoutesForRouteId(routeId).length > 0 ? getGtfsRoutesForRouteId(routeId) : getGtfsRoutesForLine(line);
  const candidates = routes
    .map((route) => {
      const progress = routeProgressAtPoint(route.path, point);
      if (!progress) return undefined;
      return {
        route,
        progress,
        score:
          progress.distanceMeters +
          bearingDelta(preferredBearing, progress.bearing) * 0.9 -
          (route.id === previousRouteVariantId && progress.distanceMeters < 90 ? 35 : 0),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => a.score - b.score);

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
    routeVariantId: best.route.id,
    shapeId: best.route.shapeId,
  };
}

function compensateFeedLatency(
  routeVariantId: string | undefined,
  point: { lat: number; lon: number },
  speedKmhValue: number,
  ageSeconds: number,
) {
  if (!routeVariantId || speedKmhValue < 3 || speedKmhValue > 75 || ageSeconds < 4) return undefined;
  const routeVariant = getGtfsRouteVariant(routeVariantId);
  if (!routeVariant || routeVariant.path.length < 2) return undefined;
  const progress = routeProgressAtPoint(routeVariant.path, point);
  if (!progress) return undefined;

  const totalMeters = progress.traveledMeters + progress.remainingMeters;
  if (totalMeters <= 0) return undefined;
  const compensationSeconds = Math.min(ageSeconds, 28);
  const advanceMeters = Math.min(260, (speedKmhValue / 3.6) * compensationSeconds);
  if (advanceMeters < 8) return undefined;
  const compensated = interpolatePathState(
    routeVariant.path,
    Math.min(0.999999, (progress.traveledMeters + advanceMeters) / totalMeters),
  );
  return compensated ? { point: compensated.point, bearing: compensated.bearing } : undefined;
}

function hasNumericCoordinate(vehicle: GttVehiclePosition): vehicle is GttVehiclePosition & { lat: number; lon: number } {
  return (
    typeof vehicle.lat === 'number' &&
    typeof vehicle.lon === 'number' &&
    Number.isFinite(vehicle.lat) &&
    Number.isFinite(vehicle.lon) &&
    !(vehicle.lat === 0 && vehicle.lon === 0)
  );
}

function isValidGttCoverageCoordinate(vehicle: GttVehiclePosition) {
  return (
    hasNumericCoordinate(vehicle) &&
    // GTT includes urban, suburban and interurban services around Torino.
    // Keep this deliberately wider than the city core so valid extraurban
    // vehicles are not filtered out before reaching the map.
    vehicle.lat > 44.7 &&
    vehicle.lat < 45.35 &&
    vehicle.lon > 7.25 &&
    vehicle.lon < 8.15
  );
}

function toVehicleSafely(vehicle: GttVehiclePosition, index: number) {
  try {
    return toVehicle(vehicle, index);
  } catch (error) {
    console.warn('[BusRadar] Veicolo GTFS-RT ignorato durante la trasformazione', {
      vehicleId: vehicle.vehicleId,
      routeId: vehicle.routeId,
      tripId: vehicle.tripId,
      error,
    });
    return undefined;
  }
}

function toVehicle(vehicle: GttVehiclePosition, index: number): Vehicle {
  const routeId = vehicle.routeId || 'GTT';
  const line = normalizeRouteName(routeId);
  const gtfsLine = getGtfsLine(line);
  const vehicleType = vehicleTypeForRoute(routeId);
  const vehicleId = normalizeVehicleId(vehicle.vehicleId) || normalizeVehicleId(vehicle.vehicleLabel ?? null);
  const fleetNumber = publicFleetNumber(vehicleId);
  const fleetIdentifier = fleetNumber ?? null;
  const vehicleLivery = vehicleLiveryForVehicle(routeId, line, fleetIdentifier);
  const lengthClass = vehicleLengthClass(fleetIdentifier, vehicleType);
  const fleetKey = vehicleFleetKey(fleetIdentifier, vehicleType);
  const vehicleIdSource: Vehicle['vehicleIdSource'] = fleetNumber
    ? normalizeVehicleId(vehicle.vehicleId)
      ? 'vehicle.id'
      : 'vehicle.label'
    : 'feed-internal';
  const { speed, source: speedSource, bearing: observedBearing } = observedSpeed(vehicleId || String(index), vehicle);
  const rawPoint = { lat: vehicle.lat ?? 0, lon: vehicle.lon ?? 0 };
  const sampleTimestampMs = timestampMs(vehicle.timestamp);
  const ageSeconds = feedAgeSeconds(vehicle.timestamp);
  const feedBearing = vehicle.bearing != null && vehicle.bearing >= 0 ? vehicle.bearing : undefined;
  const preferredBearing = observedBearing ?? feedBearing;
  const estimate = terminalEstimate(
    routeId,
    line,
    rawPoint,
    speed,
    preferredBearing,
    previousRouteVariants.get(vehicleId),
  );
  const snapLimitMeters = vehicleLivery === 'interurban-blue' ? 70 : 55;
  const isSnappedToRoute = Boolean(estimate.snappedPoint && estimate.offRouteMeters != null && estimate.offRouteMeters <= snapLimitMeters);
  const displayPoint = isSnappedToRoute ? estimate.snappedPoint! : rawPoint;
  const finalPoint = displayPoint;
  const routeMatchStatus: Vehicle['routeMatchStatus'] = estimate.offRouteMeters == null
    ? 'unmatched'
    : isSnappedToRoute
      ? 'on-route'
      : 'gps-only';
  if (estimate.routeVariantId && isSnappedToRoute) {
    previousRouteVariants.set(vehicleId, estimate.routeVariantId);
  }

  return {
    vehicleId,
    fleetNumber,
    realtimeEntityId: normalizeOptionalVehicleId(vehicle.entityId),
    realtimeVehicleId: normalizeOptionalVehicleId(vehicle.vehicleId),
    realtimeVehicleLabel: normalizeOptionalVehicleId(vehicle.vehicleLabel),
    licensePlate: vehicle.licensePlate || undefined,
    tripId: vehicle.tripId || undefined,
    vehicleIdSource,
    routeId: `gtt-${routeId}`,
    routeShortName: line,
    vehicleType,
    vehicleLivery,
    vehicleLengthClass: lengthClass,
    vehicleFleetLabel: fleetNumber
      ? vehicleFleetLabel(fleetIdentifier, vehicleType, vehicleLivery, lengthClass)
      : vehicleType === 'tram'
        ? 'Tram · modello non identificato'
        : 'Bus · modello non identificato',
    vehicleFleetKey: fleetKey,
    routeMatchStatus,
    routeVariantId: estimate.routeVariantId,
    shapeId: estimate.shapeId,
    offRouteMeters: estimate.offRouteMeters,
    lat: finalPoint.lat,
    lon: finalPoint.lon,
    bearing: isSnappedToRoute
      ? estimate.bearing ?? 0
      : preferredBearing ?? estimate.bearing ?? 0,
    speed,
    speedSource,
    feedTimestampMs: sampleTimestampMs,
    feedAgeSeconds: ageSeconds,
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
    const [vehicleResponse] = await Promise.all([
      fetch(`${GTT_REALTIME_API_BASE}/vehicles`),
      loadGtfsNetwork().catch(() => undefined),
    ]);
    response = vehicleResponse;
  } catch {
    return undefined;
  }

  if (!response.ok) return undefined;

  const payload = (await response.json()) as GttVehiclesResponse;
  if (payload.status !== 'ok' || !Array.isArray(payload.vehicles)) return undefined;

  const identifiableVehicles = payload.vehicles.filter((vehicle) => vehicle.vehicleId || vehicle.vehicleLabel);
  const inCoverageVehicles = identifiableVehicles.filter(isValidGttCoverageCoordinate);
  const sourceVehicles = inCoverageVehicles.length > 0
    ? inCoverageVehicles
    : identifiableVehicles.filter(hasNumericCoordinate);
  const vehicles = sourceVehicles
    .map(toVehicleSafely)
    .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
  if (vehicles.length === 0) {
    try {
      const cached = localStorage.getItem(vehicleSnapshotCacheKey);
      if (!cached) return undefined;
      const snapshot = JSON.parse(cached) as GttRealtimeSnapshot;
      const age = Date.now() - new Date(snapshot.checkedAt).getTime();
      return Number.isFinite(age) && age <= 5 * 60_000 ? snapshot : undefined;
    } catch {
      return undefined;
    }
  }

  const snapshot = {
    vehicles,
    entityCount: payload.entityCount ?? vehicles.length,
    vehiclePositionCount: payload.vehiclePositionCount ?? vehicles.length,
    checkedAt: payload.checkedAt ?? new Date().toISOString(),
  };
  try {
    localStorage.setItem(vehicleSnapshotCacheKey, JSON.stringify(snapshot));
  } catch {
    // The live snapshot remains usable even if browser storage is unavailable.
  }
  return snapshot;
}
