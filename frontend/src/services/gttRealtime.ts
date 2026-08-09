import type { Vehicle } from '../types';
import { getGtfsLine, getGtfsRouteVariant, getGtfsRoutesForLine, getGtfsRoutesForRouteId, loadGtfsNetwork } from '../data/gtfsNetwork';
import { recognizedFleetNumber, vehicleFleetKey, vehicleFleetLabel, vehicleLengthClass, vehicleLiveryForVehicle, vehicleTypeForFleetNumber } from '../data/vehicleFleetRules';
import { bearingDegrees, distanceMeters, interpolatePathState, routeProgressAtPoint } from '../utils/geo';
import { fetchStopSchedule, type StopScheduleCalendar, type StopScheduleEntry } from './stopSchedule';

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

type GttFeedHeader = {
  timestamp?: string | number | null;
};

type GttVehiclesResponse = {
  status: 'ok' | string;
  entityCount?: number;
  vehiclePositionCount?: number;
  checkedAt?: string;
  header?: GttFeedHeader;
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

export const GTT_REALTIME_API_BASE =
  import.meta.env.VITE_REALTIME_API_BASE ?? 'https://mtuwzlbxhmpnqpaahity.supabase.co/functions/v1/gtt-realtime';
const vehicleSnapshotCacheKey = 'busradar:last-valid-vehicle-snapshot';

const tramRoutes = new Set(['3', '4', '9', '10', '13', '15', '16']);

function normalizeRouteName(routeId: string) {
  return routeId.replace(/U$/, '');
}

function lineNameForRoute(routeId: string) {
  return getGtfsRoutesForRouteId(routeId)[0]?.line ?? normalizeRouteName(routeId);
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
  const lineName = lineNameForRoute(routeId);
  return getGtfsLine(lineName)?.vehicleType ?? (tramRoutes.has(routeName) ? 'tram' : 'bus');
}

// When GTT generated the feed we are currently showing. A vehicle position
// cannot be fresher than the feed that carries it, so this is the floor for the
// age of every sample in it.
let feedGeneratedAtMs: number | undefined;
let tripUpdatesCache: { at: number; updates: GttTripUpdate[] } | undefined;
let rawVehiclesCache: { at: number; vehicles: GttVehiclePosition[] } | undefined;
const previousSamples = new Map<string, { lat: number; lon: number; timestampMs: number; speed: number }>();
const previousRouteVariants = new Map<string, string>();
const previousRoutePositions = new Map<string, { routeVariantId: string; meters: number; timestampMs: number }>();

// These predictions feed the headway estimate between two vehicles of the same
// line, which compares the times they announce for the stops they share. Only
// the feed's own values are used: the identifiers just have to be consistent
// between the two vehicles, so a sequence number stands in when no stop id is
// given.
function realtimeStopPredictions(update?: GttTripUpdate): Vehicle['stopPredictions'] {
  if (!update) return undefined;
  const now = Date.now();
  const predictions = update.stopTimeUpdates
    .map((stop) => {
      const seconds = Number(stop.arrivalTime ?? stop.departureTime ?? 0);
      const stopId = stop.stopId || (stop.stopSequence != null ? `sequence:${stop.stopSequence}` : undefined);
      const arrivalTimeMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
      if (!stopId || arrivalTimeMs == null) return undefined;
      return {
        stopId,
        stopSequence: stop.stopSequence ?? undefined,
        arrivalTimeMs,
      };
    })
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction))
    .filter((prediction) => prediction.arrivalTimeMs >= now - 60_000 && prediction.arrivalTimeMs <= now + 3 * 60 * 60_000)
    .sort((a, b) => a.arrivalTimeMs - b.arrivalTimeMs);
  return predictions.length > 0 ? predictions : undefined;
}

function stableRoutePositionMeters(
  vehicleId: string,
  routeVariantId: string | undefined,
  meters: number | undefined,
  timestampMsValue: number,
) {
  if (!routeVariantId || meters == null || !Number.isFinite(meters)) return meters;
  const previous = previousRoutePositions.get(vehicleId);
  if (!previous || previous.routeVariantId !== routeVariantId || timestampMsValue - previous.timestampMs > 180_000) {
    previousRoutePositions.set(vehicleId, { routeVariantId, meters, timestampMs: timestampMsValue });
    return meters;
  }

  const jumpMeters = Math.abs(meters - previous.meters);
  if (jumpMeters > 1_200) {
    previousRoutePositions.set(vehicleId, { routeVariantId, meters, timestampMs: timestampMsValue });
    return meters;
  }

  const withoutBackwardGpsJitter = meters < previous.meters && previous.meters - meters < 180
    ? previous.meters
    : meters;
  const smoothedMeters = previous.meters * 0.55 + withoutBackwardGpsJitter * 0.45;
  previousRoutePositions.set(vehicleId, { routeVariantId, meters: smoothedMeters, timestampMs: timestampMsValue });
  return smoothedMeters;
}

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

function localGtfsDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function serviceRunsToday(serviceId: string | undefined, calendar: StopScheduleCalendar | undefined, date: Date) {
  if (!serviceId || !calendar) return true;

  const dayKey = localGtfsDate(date);
  const exception = calendar.exceptions[dayKey]?.[serviceId];
  if (exception === 1) return true;
  if (exception === 2) return false;

  const service = calendar.services[serviceId];
  if (!service) return true;
  return dayKey >= service.startDate && dayKey <= service.endDate && service.days[date.getDay()] === 1;
}

// A stop panel answers "what comes next here", so departures are taken from a
// window around now rather than from the whole 30 hour horizon the dataset
// covers, and no single line may fill it.
const NEAR_DEPARTURE_WINDOW_MINUTES = 90;
const MAX_DEPARTURES_PER_LINE = 3;
const MIN_DEPARTURES_SHOWN = 8;

function scheduledStopArrivals(
  entries: StopScheduleEntry[],
  allowedRouteIds: string[],
  calendar: StopScheduleCalendar | undefined,
): GttStopArrival[] {
  if (entries.length === 0) return [];

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
  // The calendar answer only depends on the service and the day, and the same
  // service repeats across most entries of a stop.
  const runsByServiceAndDay = new Map<string, boolean>();

  const candidates: GttStopArrival[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalizedRouteId = normalizeRouteName(entry.line || entry.routeId);
    if (allowed.size > 0 && !allowed.has(entry.routeId) && !allowed.has(normalizedRouteId)) continue;

    for (const { date, dayOffset } of serviceDays) {
      const cacheKey = `${entry.serviceId}:${dayOffset}`;
      let runs = runsByServiceAndDay.get(cacheKey);
      if (runs == null) {
        runs = serviceRunsToday(entry.serviceId, calendar, date);
        runsByServiceAndDay.set(cacheKey, runs);
      }
      if (!runs) continue;

      const absoluteSeconds = dayOffset * 86400 + entry.seconds;
      if (absoluteSeconds < secondsNow || absoluteSeconds > maxHorizonSeconds) continue;

      // The same departure is often written under more than one service
      // calendar, and a few appear twice under the same one. Identical
      // departures are one departure.
      const identity = `${entry.serviceId}:${entry.routeId}:${entry.seconds}:${dayOffset}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      const time = new Date(now);
      time.setHours(0, 0, 0, 0);
      time.setSeconds(absoluteSeconds);
      const clock = time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      // A night service is written as 27:49 rather than as tomorrow 03:49, so
      // the day cannot be read off the offset: compare the resulting dates.
      const isAnotherDay = localGtfsDate(time) !== localGtfsDate(now);

      candidates.push({
        routeId: entry.routeId,
        line: normalizedRouteId,
        tripId: identity,
        // A departure on another day has to say so, otherwise 05:01 reads as
        // five in the morning today and the panel looks made up.
        timeLabel: isAnotherDay ? `domani ${clock}` : clock,
        minutes: Math.max(0, Math.round((absoluteSeconds - secondsNow) / 60)),
        source: 'scheduled' as const,
        delaySeconds: undefined,
        vehicleId: undefined,
      });
    }
  }
  candidates.sort((a, b) => a.minutes - b.minutes);

  // What a stop panel is for is the next departures, not the whole timetable.
  // Taking the first departure of every line served here filled the list with
  // night services nineteen hours away, shown next to arrivals seven minutes
  // out; and one line every five minutes took every slot on its own.
  const selected: GttStopArrival[] = [];
  const perLine = new Map<string, number>();
  for (const arrival of candidates) {
    if (arrival.minutes > NEAR_DEPARTURE_WINDOW_MINUTES) break;
    const shown = perLine.get(arrival.line) ?? 0;
    if (shown >= MAX_DEPARTURES_PER_LINE) continue;
    perLine.set(arrival.line, shown + 1);
    selected.push(arrival);
    if (selected.length >= 16) break;
  }

  // A stop served by a single frequent line would otherwise show three
  // departures and stop there, so the per line cap is relaxed until the panel
  // has a useful number of them.
  if (selected.length < MIN_DEPARTURES_SHOWN) {
    const already = new Set(selected.map((arrival) => arrival.tripId));
    for (const arrival of candidates) {
      if (selected.length >= MIN_DEPARTURES_SHOWN) break;
      if (arrival.minutes > NEAR_DEPARTURE_WINDOW_MINUTES) break;
      if (already.has(arrival.tripId)) continue;
      already.add(arrival.tripId);
      selected.push(arrival);
    }
  }

  // Outside service hours nothing falls in the window, and an empty panel says
  // less than the time service resumes.
  if (selected.length === 0) {
    const firstByLine = new Map<string, GttStopArrival>();
    for (const arrival of candidates) {
      if (!firstByLine.has(arrival.line)) firstByLine.set(arrival.line, arrival);
    }
    selected.push(...[...firstByLine.values()].sort((a, b) => a.minutes - b.minutes).slice(0, 4));
  }

  return selected.sort((a, b) => a.minutes - b.minutes);
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
  // The scheduled timetable is a local asset and stays available while the
  // realtime proxy is unreachable. Letting a feed failure reject here hid the
  // timetable too, and the stop panel fell back to "passaggi non caricabili"
  // even though it had everything it needed to show the scheduled departures.
  const [updates, rawVehicles, schedule] = await Promise.all([
    fetchTripUpdates().catch(() => []),
    fetchRawVehicles().catch(() => []),
    fetchStopSchedule(stopId),
  ]);
  const now = Date.now();
  const allowed = new Set(allowedRouteIds.flatMap((routeId) => [routeId, normalizeRouteName(routeId)]));
  const routeByVehicle = new Map(rawVehicles.map((vehicle) => [vehicle.vehicleId, vehicle.routeId]).filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])));

  const realtimeArrivals = updates
    .flatMap((trip) => {
      const routeId = trip.routeId || routeByVehicle.get(trip.vehicleId ?? '') || '';
      const resolvedRouteId = routeId;
      const normalizedRouteId = normalizeRouteName(resolvedRouteId);
      const sequenceSet = new Set([
        ...(stopSequencesByRoute[resolvedRouteId] ?? []),
        ...(stopSequencesByRoute[normalizedRouteId] ?? []),
        ...(stopSequencesByRoute[`${normalizedRouteId}U`] ?? []),
      ]);

      return trip.stopTimeUpdates
        .filter((stopUpdate) => {
          // An explicit stop id settles the question in both directions: a
          // different id means a different stop, not a candidate to rescue
          // through its ordinal.
          if (stopUpdate.stopId) return stopUpdate.stopId === stopId;
          if (stopUpdate.stopSequence == null) return false;
          // Nothing resolves this sequence to a stop, so the ordinal is the
          // only signal left. It stays a last resort rather than an
          // alternative, because a position is shared by every variant of the
          // line and by the opposite direction.
          return Boolean(resolvedRouteId) && sequenceSet.has(stopUpdate.stopSequence);
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

  const scheduledArrivals = scheduledStopArrivals(schedule.entries, allowedRouteIds, schedule.calendar);
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

function epochSecondsToMs(timestamp: string | number | null | undefined) {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

// Not every GTT vehicle carries its own timestamp. Treating a sample with no
// timestamp as if it had just been produced said the position was current when
// it was a minute old, and the latency compensation, which only acts on a known
// age, then did nothing at all: the marker stayed a full feed behind. Fall back
// to the moment the feed itself was generated.
function timestampMs(timestamp: string | null) {
  return epochSecondsToMs(timestamp) ?? feedGeneratedAtMs ?? Date.now();
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
          // Outbound and return shapes of the same line run a few metres apart,
          // so a marginally better score on the opposite shape used to flip the
          // match between samples and teleport the marker backwards along the
          // other direction. Stay on the shape already in use unless the vehicle
          // clearly left it.
          (route.id === previousRouteVariantId && progress.distanceMeters < 140 ? 95 : 0),
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
    progress: best.progress.traveledMeters + best.progress.remainingMeters > 0
      ? best.progress.traveledMeters / (best.progress.traveledMeters + best.progress.remainingMeters)
      : 0,
    bearing: best.progress.bearing,
    snappedPoint: best.progress.projectedPoint,
    offRouteMeters: Math.round(best.progress.distanceMeters),
    routeVariantId: best.route.id,
    shapeId: best.route.shapeId,
  };
}

// Dead reckoning assumes a constant speed, while a city vehicle brakes, queues
// and dwells at stops. Advancing the full theoretical distance would routinely
// overshoot and force the next sample to drag the marker backwards, so keep a
// confidence margin and hard caps on how far ahead a marker may be projected.
const MAX_LATENCY_COMPENSATION_SECONDS = 75;
const MAX_LATENCY_COMPENSATION_METERS = 700;
const LATENCY_COMPENSATION_CONFIDENCE = 0.9;
// The projection targets the position the vehicle held when the sample was
// fetched, but the marker only reaches that point over the seconds that follow,
// and the next sample is another poll away. Aiming slightly ahead keeps the
// marker level with the vehicle across the interval instead of trailing it by
// the length of its own playback.
const LATENCY_COMPENSATION_LEAD_SECONDS = 3;

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
  // The GTT feed is regularly one minute old. Compensating only a part of that
  // age leaves a residual lag that the playback has to absorb later as an
  // unrealistic burst of speed, so cover the observed staleness instead.
  const compensationSeconds = Math.min(
    ageSeconds + LATENCY_COMPENSATION_LEAD_SECONDS,
    MAX_LATENCY_COMPENSATION_SECONDS,
  );
  const advanceMeters = Math.min(
    MAX_LATENCY_COMPENSATION_METERS,
    (speedKmhValue / 3.6) * compensationSeconds * LATENCY_COMPENSATION_CONFIDENCE,
    // Dead reckoning may not push a vehicle past its own terminus.
    Math.max(0, progress.remainingMeters - 5),
  );
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

function toVehicleSafely(vehicle: GttVehiclePosition, index: number, tripUpdate?: GttTripUpdate) {
  try {
    return toVehicle(vehicle, index, tripUpdate);
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

function toVehicle(vehicle: GttVehiclePosition, index: number, tripUpdate?: GttTripUpdate): Vehicle {
  const routeId = vehicle.routeId || 'GTT';
  const line = lineNameForRoute(routeId);
  const gtfsLine = getGtfsLine(line);
  const vehicleId = normalizeVehicleId(vehicle.vehicleId) || normalizeVehicleId(vehicle.vehicleLabel ?? null);
  // The route says what the service is, the fleet number says what the vehicle
  // is. They disagree when a bus replaces a tram, and then the vehicle wins.
  const routeVehicleType = vehicleTypeForRoute(routeId);
  const vehicleType = vehicleTypeForFleetNumber(vehicleId) ?? routeVehicleType;
  const isReplacementService = vehicleType !== routeVehicleType;
  const fleetNumber = recognizedFleetNumber(vehicleId, vehicleType);
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
  const latencyCompensation = isSnappedToRoute
    ? compensateFeedLatency(estimate.routeVariantId, displayPoint, speed, ageSeconds)
    : undefined;
  const finalPoint = latencyCompensation?.point ?? displayPoint;
  const finalRouteProgress = (() => {
    if (!isSnappedToRoute || !estimate.routeVariantId) return undefined;
    const routeVariant = getGtfsRouteVariant(estimate.routeVariantId);
    return routeVariant ? routeProgressAtPoint(routeVariant.path, finalPoint) : undefined;
  })();
  const routeLengthMeters = finalRouteProgress
    ? finalRouteProgress.traveledMeters + finalRouteProgress.remainingMeters
    : undefined;
  const finalProgress = finalRouteProgress && routeLengthMeters && routeLengthMeters > 0
    ? finalRouteProgress.traveledMeters / routeLengthMeters
    : estimate.progress ?? 0;
  const stablePositionMeters = stableRoutePositionMeters(
    vehicleId,
    estimate.routeVariantId,
    finalRouteProgress?.traveledMeters,
    sampleTimestampMs,
  );
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
    isReplacementService,
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
    routePositionMeters: stablePositionMeters,
    routeLengthMeters,
    stopPredictions: realtimeStopPredictions(tripUpdate),
    lat: finalPoint.lat,
    lon: finalPoint.lon,
    bearing: isSnappedToRoute
      ? latencyCompensation?.bearing ?? estimate.bearing ?? 0
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
    progress: finalProgress,
    nextStop: estimate.terminalName ?? (vehicle.tripId ? `Trip ${vehicle.tripId}` : undefined),
    terminalName: estimate.terminalName,
    etaTerminalMinutes: estimate.etaTerminalMinutes,
    etaTerminalTimeLabel: estimate.etaTerminalTimeLabel,
    remainingKm: finalRouteProgress
      ? Math.round((finalRouteProgress.remainingMeters / 1000) * 10) / 10
      : estimate.remainingKm,
  };
}

export async function fetchGttRealtimeVehicles(): Promise<GttRealtimeSnapshot | undefined> {
  let response: Response;
  try {
    const [vehicleResponse, , tripUpdates] = await Promise.all([
      fetch(`${GTT_REALTIME_API_BASE}/vehicles`),
      loadGtfsNetwork().catch(() => undefined),
      fetchTripUpdates().catch(() => []),
    ]);
    response = vehicleResponse;
    tripUpdatesCache = { at: Date.now(), updates: tripUpdates };
  } catch {
    return undefined;
  }

  if (!response.ok) return undefined;

  const payload = (await response.json()) as GttVehiclesResponse;
  if (payload.status !== 'ok' || !Array.isArray(payload.vehicles)) return undefined;

  feedGeneratedAtMs = epochSecondsToMs(payload.header?.timestamp);

  const identifiableVehicles = payload.vehicles.filter((vehicle) => vehicle.vehicleId || vehicle.vehicleLabel);
  const inCoverageVehicles = identifiableVehicles.filter(isValidGttCoverageCoordinate);
  const sourceVehicles = inCoverageVehicles.length > 0
    ? inCoverageVehicles
    : identifiableVehicles.filter(hasNumericCoordinate);
  const updates = tripUpdatesCache?.updates ?? [];
  const updateByTrip = new Map(updates.filter((update) => update.tripId).map((update) => [update.tripId!, update]));
  const updateByVehicle = new Map(updates.flatMap((update) => {
    const ids = [update.vehicleId, update.vehicleLabel].map((id) => normalizeVehicleId(id ?? null)).filter(Boolean);
    return ids.map((id) => [id, update] as const);
  }));
  const vehicles = sourceVehicles
    .map((vehicle, index) => {
      const vehicleId = normalizeVehicleId(vehicle.vehicleId) || normalizeVehicleId(vehicle.vehicleLabel ?? null);
      const update = (vehicle.tripId ? updateByTrip.get(vehicle.tripId) : undefined) ?? updateByVehicle.get(vehicleId);
      return toVehicleSafely(vehicle, index, update);
    })
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
