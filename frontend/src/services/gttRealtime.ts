import type { Vehicle } from '../types';
import { getGtfsLine, getGtfsNetworkBounds, getGtfsRouteVariant, getGtfsRoutesForLine, getGtfsRoutesForRouteId, getGtfsStopsForRoute, loadGtfsNetwork, type GtfsRouteVariant } from '../data/gtfsNetwork';
import { recognizedFleetNumber, vehicleFleetKey, vehicleFleetLabel, vehicleLengthClass, vehicleLiveryForVehicle, vehicleTypeForFleetNumber } from '../data/vehicleFleetRules';
import { bearingDegrees, distanceMeters, interpolatePathState, routeProgressAtPoint } from '../utils/geo';
import { fetchStopSchedule, fetchStopScheduleCalendar, isStopScheduleLoaded, peekStopSchedule, requestStopSchedule, type StopScheduleCalendar, type StopScheduleEntry } from './stopSchedule';
import { loadScheduledRuns, peekScheduledRuns, scheduledRunsInProgress } from './scheduledRuns';

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
// Average pace over the recent past, per vehicle. The instantaneous speed of a
// sample says how fast the vehicle was going at one instant; projecting a
// minute of travel needs how fast it has been going.
const recentSpeeds = new Map<string, { kmh: number; atMs: number }>();

// The averaging window has to match the span the projection covers: the
// question being answered is how far the vehicle went in the last minute, so
// the average has to be over the last minute. Weighted by the real time between
// samples rather than by their count, because the feed's own timestamps cannot
// be trusted and the polling interval is not guaranteed.
const SPEED_AVERAGE_WINDOW_SECONDS = 60;
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

  const now = Date.now();
  const previousAverage = recentSpeeds.get(vehicleId);
  const sinceLastSeconds = previousAverage ? Math.max(0, (now - previousAverage.atMs) / 1000) : 0;
  // A gap longer than the window means the vehicle was not being watched, so
  // the old average says nothing about it any more.
  // Deliberately symmetric. Letting a slowdown into the average faster than a
  // pickup looks obviously right and measures worse: the average already counts
  // the samples taken while the vehicle stood at its stops, so reacting to a
  // slowdown a second time charges the same halt twice and leaves every marker
  // trailing.
  const weight = previousAverage
    ? Math.min(1, Math.max(0.05, sinceLastSeconds / SPEED_AVERAGE_WINDOW_SECONDS))
    : 1;
  const recentSpeed = previousAverage ? previousAverage.kmh * (1 - weight) + speed * weight : speed;
  recentSpeeds.set(vehicleId, { kmh: recentSpeed, atMs: now });

  return { speed, source, bearing: observedBearing, recentSpeed };
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

// GTT stamps its vehicle positions as if they had just been measured. Observed
// on the map, the same vehicles run about a minute behind, and the arithmetic
// agrees: a marker recovering only 26 m at urban speed implies a declared age
// of a few seconds, where a real minute would have called for 200 to 400 m.
//
// The delay is therefore real but undeclared, and no amount of reading the feed
// can derive it: the data denies it exists. This is the floor we assume for it.
//
// It covers only part of the delay on purpose. Projecting the whole of it was
// tried and made the map worse: the projection assumes the vehicle holds its
// recent pace, a city bus does not, and routeMotion refuses to move a marker
// backwards. So every overshoot became a full frame with the marker standing
// still while the real vehicle drove on, and the map read as more stuck and
// further behind than with no compensation at all.
//
// Correcting part of the delay reduces the lag without buying it back in
// stalls. Raise it if vehicles trail steadily; lower it if they start freezing
// in place waiting for the next sample to reach them.
//
// Calibrated from the street rather than from the data, one step at a time:
//
//   floor   recovered   observed on the map
//     0 s        3 s    behind by the full minute
//    25 s       25 s    behind by 30-35 s, motion smooth
//    35 s       34 s    catching up in one jump, then waiting past the stop
//    50 s       48 s    markers freezing, worse than no compensation at all
//
// Those readings put the real delay near a minute. The failures above 25 s were
// not the amount but the shape of the projection: it ran the vehicle through
// stops it was serving, and it changed by a hundred metres between one sample
// and the next. Both are addressed below, by spending the projection on a route
// with stops on it and by limiting how fast the correction may change.
// **Misurato sul feed vero il 2026-08-10.** L'header stava a 15:59:46 e i
// campioni portavano timestamp fra 15:59:16 e 15:59:37: il feed dichiara quindi
// 10-30 secondi di età, non i 3 che si erano dedotti da uno screenshot. Con un
// ritardo osservato dalla strada di 50-60 s, la parte non dichiarata vale una
// ventina di secondi sopra a quella dichiarata.
//
// E si **somma**, non sostituisce. Con un pavimento, un campione che si dichiara
// già vecchio di 40 s non riceveva alcuna correzione, come se per lui la
// tubatura fra misura e lettura non esistesse; nel feed reale quei campioni ci
// sono, fino a cinque minuti. Nel caso tipico i due modelli coincidono — 15+20
// è 35, il valore tarato dalla strada — quindi questa è una correzione di forma
// che non sposta la mappa di tutti i giorni.
const ASSUMED_UNDECLARED_FEED_DELAY_SECONDS = 20;

// A city vehicle does not spend the whole delay moving: it opens its doors.
// Projecting a bus that is serving a stop straight through it put the marker a
// hundred metres down the road, where it stood waiting for the real vehicle to
// arrive. Charging the projection for the stops it crosses keeps it on the near
// side of them, which is where the vehicle is.
const STOP_DWELL_SECONDS = 15;

// How much of the vehicle's own speed the correction may spend on changing
// itself. The marker therefore moves between 0,65x and 1,35x the speed of the
// vehicle it represents: never backwards, never in a lurch, and the same
// recovery margin the playback in BusMap already allows itself.
const LATENCY_ADJUST_FRACTION = 0.35;

// Every projection so far shares one weakness: it extrapolates. It takes a
// position from a minute ago and a speed, and guesses forward, and a guess
// about a city bus is wrong whenever the traffic decides otherwise.
//
// The feed also carries what GTT expects: the time each vehicle will reach the
// stops ahead of it. That turns the guess into an interpolation between two
// known instants — where the vehicle was, and where it is about to be — with
// the vehicle somewhere in between. The marker converges on the stop instead of
// being flung past it, and an error in the prediction costs far less than an
// error in the assumed speed: on the bench, moving the prediction error from
// 20 s to 40 s barely moves the result.
//
// It cannot recover the undeclared delay, though. The near end of the
// interpolation is still the stale sample, believed younger than it is, so the
// floor above still does the work it did.
function anchoredAdvanceMeters(
  routeVariant: GtfsRouteVariant,
  traveledMeters: number,
  believedSampleAtMs: number,
  tripUpdate: GttTripUpdate | undefined,
) {
  if (!tripUpdate) return undefined;
  const now = Date.now();
  if (believedSampleAtMs >= now) return undefined;
  const byStopId = stopDistancesByStopId(routeVariant);

  let nearestMeters: number | undefined;
  let nearestAtMs: number | undefined;
  for (const update of tripUpdate.stopTimeUpdates) {
    if (!update.stopId) continue;
    const atMs = epochSecondsToMs(update.arrivalTime ?? update.departureTime);
    // A prediction already due tells us nothing about where the vehicle is now.
    if (atMs == null || atMs <= now) continue;
    const occurrences = byStopId.get(update.stopId);
    if (!occurrences) continue;
    // On a loop the same stop is served twice: the one being approached is the
    // first still ahead of the vehicle.
    const meters = occurrences.find((candidate) => candidate > traveledMeters + 5);
    if (meters == null) continue;
    if (nearestMeters == null || meters < nearestMeters) {
      nearestMeters = meters;
      nearestAtMs = atMs;
    }
  }

  if (nearestMeters == null || nearestAtMs == null) return undefined;
  const share = (now - believedSampleAtMs) / (nearestAtMs - believedSampleAtMs);
  return (nearestMeters - traveledMeters) * Math.min(1, Math.max(0, share));
}

// The timetable knows something neither the position nor the speed can say:
// how long this particular stretch of street takes. A block through the centre
// is slower than a boulevard, every day, and GTT has measured it over years of
// service.
//
// What is taken from it is only the pace of the segment, never the clock. The
// scheduled times of a trip running late would put the marker where the vehicle
// should have been; the ratio between two scheduled times says how long the
// segment takes, and a vehicle running late covers it at much the same pace.
// The position stays the feed's, the timetable only says how fast to close the
// remaining metres.
//
// Only stops whose bucket has already been fetched can answer, so this improves
// as the lines being watched settle in, and never blocks a refresh.
const SCHEDULED_PACE_MAX_SEGMENT_SECONDS = 900;
const scheduledSegmentSeconds = new Map<string, number | undefined>();

function scheduledSegmentPaceSeconds(line: string, fromStopId: string, toStopId: string) {
  const key = `${line}|${fromStopId}|${toStopId}`;
  if (scheduledSegmentSeconds.has(key)) return scheduledSegmentSeconds.get(key);
  if (!isStopScheduleLoaded(fromStopId) || !isStopScheduleLoaded(toStopId)) return undefined;

  // Every service day is taken, not only today's. The question is how long the
  // segment takes, and that hardly depends on which calendar the trip belongs
  // to; using them all gives the median far more trips to stand on.
  const departures = (peekStopSchedule(fromStopId) ?? [])
    .filter((entry) => entry.line === line)
    .map((entry) => entry.seconds)
    .sort((a, b) => a - b);
  const arrivals = (peekStopSchedule(toStopId) ?? [])
    .filter((entry) => entry.line === line)
    .map((entry) => entry.seconds)
    .sort((a, b) => a - b);

  // Each departure is paired with the first call at the next stop after it.
  // Between two consecutive stops the run is shorter than the headway, so that
  // call belongs to the same trip; anything longer is a pairing that failed and
  // is discarded rather than believed.
  const runs: number[] = [];
  for (const departure of departures) {
    const arrival = arrivals.find((candidate) => candidate > departure);
    if (arrival == null) continue;
    const run = arrival - departure;
    if (run > 0 && run <= SCHEDULED_PACE_MAX_SEGMENT_SECONDS) runs.push(run);
  }

  runs.sort((a, b) => a - b);
  const median = runs.length >= 3 ? runs[Math.floor(runs.length / 2)] : undefined;
  scheduledSegmentSeconds.set(key, median);
  return median;
}

// Where the stops of a route sit along its shape, in metres from the start.
// Computed once per variant: the projection needs it on every sample.
const routeStopDistances = new Map<string, number[]>();
const routeStopDistancesByStopId = new Map<string, Map<string, number[]>>();
// The same stops in order along the shape, so the pair the vehicle sits between
// can be found from its position alone.
const routeStopsInOrder = new Map<string, Array<{ stopId: string; meters: number }>>();
// How far ahead of the feed each vehicle is currently being drawn.
const publishedAdvances = new Map<string, { meters: number; atMs: number }>();

function stopDistancesAlongRoute(routeVariant: GtfsRouteVariant) {
  const cached = routeStopDistances.get(routeVariant.id);
  if (cached) return cached;

  // Deliberately not routeProgressAtPoint once per stop: that helper measures
  // the whole shape on every call, and a route of forty stops over two thousand
  // points would pay for the shape forty times over. The shape is measured once
  // here and every stop is projected onto it in flat metres.
  const path = routeVariant.path;
  const distances: number[] = [];
  const byStopId = new Map<string, number[]>();
  const inOrder: Array<{ stopId: string; meters: number }> = [];
  if (path.length >= 2) {
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon = 111320 * Math.cos((path[0].lat * Math.PI) / 180);
    const cumulative = [0];
    for (let index = 0; index < path.length - 1; index += 1) {
      cumulative.push(cumulative[index] + distanceMeters(path[index], path[index + 1]));
    }

    for (const stop of getGtfsStopsForRoute(routeVariant)) {
      const px = stop.lon * metersPerDegreeLon;
      const py = stop.lat * metersPerDegreeLat;
      let bestOffRouteSquared = Number.POSITIVE_INFINITY;
      let bestMeters = 0;
      for (let index = 0; index < path.length - 1; index += 1) {
        const ax = path[index].lon * metersPerDegreeLon;
        const ay = path[index].lat * metersPerDegreeLat;
        const vx = path[index + 1].lon * metersPerDegreeLon - ax;
        const vy = path[index + 1].lat * metersPerDegreeLat - ay;
        const segmentSquared = vx * vx + vy * vy;
        const t = segmentSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / segmentSquared));
        const dx = ax + vx * t - px;
        const dy = ay + vy * t - py;
        const offRouteSquared = dx * dx + dy * dy;
        if (offRouteSquared < bestOffRouteSquared) {
          bestOffRouteSquared = offRouteSquared;
          bestMeters = cumulative[index] + (cumulative[index + 1] - cumulative[index]) * t;
        }
      }
      // A stop that does not sit on the shape belongs to some other branch:
      // charging a dwell for it would slow the projection for no reason.
      if (bestOffRouteSquared > 120 * 120) continue;
      distances.push(bestMeters);
      inOrder.push({ stopId: stop.id, meters: bestMeters });
      const occurrences = byStopId.get(stop.id);
      if (occurrences) occurrences.push(bestMeters);
      else byStopId.set(stop.id, [bestMeters]);
    }
    distances.sort((a, b) => a - b);
    inOrder.sort((a, b) => a.meters - b.meters);
    for (const occurrences of byStopId.values()) occurrences.sort((a, b) => a - b);
  }
  routeStopDistancesByStopId.set(routeVariant.id, byStopId);
  routeStopsInOrder.set(routeVariant.id, inOrder);

  routeStopDistances.set(routeVariant.id, distances);
  return distances;
}

function stopDistancesByStopId(routeVariant: GtfsRouteVariant) {
  if (!routeStopDistancesByStopId.has(routeVariant.id)) stopDistancesAlongRoute(routeVariant);
  return routeStopDistancesByStopId.get(routeVariant.id) ?? new Map<string, number[]>();
}

// La lunghezza vera della shape, sommando i segmenti. Ricavarla proiettando
// l'ultimo punto sul percorso sembra equivalente e non lo è: su una linea ad
// anello l'ultimo punto coincide col primo e la proiezione restituisce zero,
// mettendo ogni corsa di quella linea al capolinea. Succede su una variante su
// 602, il che la rende peggio di un errore evidente: passa inosservata.
const routeLengths = new Map<string, number>();

function routeLengthMeters(routeVariant: GtfsRouteVariant) {
  const cached = routeLengths.get(routeVariant.id);
  if (cached != null) return cached;
  let total = 0;
  for (let index = 0; index < routeVariant.path.length - 1; index += 1) {
    total += distanceMeters(routeVariant.path[index], routeVariant.path[index + 1]);
  }
  routeLengths.set(routeVariant.id, total);
  return total;
}

function stopsInOrderAlongRoute(routeVariant: GtfsRouteVariant) {
  if (!routeStopsInOrder.has(routeVariant.id)) stopDistancesAlongRoute(routeVariant);
  return routeStopsInOrder.get(routeVariant.id) ?? [];
}

// The timetable's answer, for the trips the realtime feed says nothing about.
// The vehicle sits between two stops; the schedule says how long that stretch
// takes; the remaining metres are covered at that pace. No absolute scheduled
// time is used, so a trip running ten minutes late is placed just as well as
// one on time.
function scheduledPaceAdvanceMeters(
  routeVariant: GtfsRouteVariant,
  traveledMeters: number,
  ageSeconds: number,
) {
  const ordered = stopsInOrderAlongRoute(routeVariant);
  if (ordered.length < 2) return undefined;

  const nextIndex = ordered.findIndex((stop) => stop.meters > traveledMeters + 5);
  if (nextIndex <= 0) return undefined;
  const previous = ordered[nextIndex - 1];
  const next = ordered[nextIndex];

  // Ask for the buckets even when they are not here yet: the answer arrives for
  // the next refresh, and the request is rationed inside stopSchedule.
  requestStopSchedule(previous.stopId);
  requestStopSchedule(next.stopId);

  const segmentMeters = next.meters - previous.meters;
  if (segmentMeters <= 0) return undefined;
  const segmentSeconds = scheduledSegmentPaceSeconds(routeVariant.line, previous.stopId, next.stopId);
  if (!segmentSeconds) return undefined;

  const remainingMeters = next.meters - traveledMeters;
  const remainingSeconds = segmentSeconds * (remainingMeters / segmentMeters);
  if (remainingSeconds <= 0) return undefined;
  return remainingMeters * Math.min(1, ageSeconds / remainingSeconds);
}

// Walk the route forward for the seconds being recovered, stopping the clock at
// every stop on the way. When the seconds run out at a stop, the vehicle is
// left there rather than beyond it.
function positionAfterSeconds(
  stopDistances: number[],
  fromMeters: number,
  seconds: number,
  speedMetersPerSecond: number,
) {
  let remainingSeconds = seconds;
  let position = fromMeters;
  for (const stopMeters of stopDistances) {
    if (stopMeters <= position) continue;
    const secondsToStop = (stopMeters - position) / speedMetersPerSecond;
    if (secondsToStop >= remainingSeconds) break;
    remainingSeconds -= secondsToStop + STOP_DWELL_SECONDS;
    position = stopMeters;
    if (remainingSeconds <= 0) return position;
  }
  return position + remainingSeconds * speedMetersPerSecond;
}

// Whatever the outcome, the marker is drawn where the correction says it is:
// leaving a stale value behind would let the next sample resume from a lead the
// vehicle no longer has, and that discontinuity is what reads as a lurch.
function recordAdvance(vehicleId: string, meters: number) {
  publishedAdvances.set(vehicleId, { meters, atMs: Date.now() });
  return meters;
}

function compensateFeedLatency(
  vehicleId: string,
  routeVariantId: string | undefined,
  point: { lat: number; lon: number },
  speedKmhValue: number,
  ageSeconds: number,
  isSnappedToRoute: boolean,
  tripUpdate: GttTripUpdate | undefined,
) {
  // Dead reckoning over the better part of a minute has to use the pace held
  // over that minute. Driven by the speed of the single sample, the projection
  // swung between nothing and four hundred metres on the same vehicle as it
  // pulled away from stops, and the marker moved in lurches.
  if (!isSnappedToRoute) {
    recordAdvance(vehicleId, 0);
    return { skipped: 'non-agganciato' as const };
  }
  if (!routeVariantId) {
    recordAdvance(vehicleId, 0);
    return { skipped: 'percorso-assente' as const };
  }
  // A sample the feed calls fresh is still assumed to carry the undeclared
  // delay, so the age used here never drops below that floor.
  const effectiveAgeSeconds = ageSeconds + ASSUMED_UNDECLARED_FEED_DELAY_SECONDS;
  if (effectiveAgeSeconds < 4) {
    recordAdvance(vehicleId, 0);
    return { skipped: 'campione-recente' as const };
  }
  if (speedKmhValue < 1.5 || speedKmhValue > 75) {
    recordAdvance(vehicleId, 0);
    return { skipped: 'troppo-lento' as const };
  }
  const routeVariant = getGtfsRouteVariant(routeVariantId);
  const progress = routeVariant && routeVariant.path.length >= 2
    ? routeProgressAtPoint(routeVariant.path, point)
    : undefined;
  const totalMeters = progress ? progress.traveledMeters + progress.remainingMeters : 0;
  if (!routeVariant || !progress || totalMeters <= 0) {
    recordAdvance(vehicleId, 0);
    return { skipped: 'percorso-assente' as const };
  }

  const speedMetersPerSecond = speedKmhValue / 3.6;
  // The GTT feed is regularly one minute old. Compensating only a part of that
  // age leaves a residual lag that the playback has to absorb later as an
  // unrealistic burst of speed, so cover the observed staleness instead.
  const compensationSeconds = Math.min(
    effectiveAgeSeconds + LATENCY_COMPENSATION_LEAD_SECONDS,
    MAX_LATENCY_COMPENSATION_SECONDS,
  ) * LATENCY_COMPENSATION_CONFIDENCE;
  const projectedMeters = positionAfterSeconds(
    stopDistancesAlongRoute(routeVariant),
    progress.traveledMeters,
    compensationSeconds,
    speedMetersPerSecond,
  ) - progress.traveledMeters;
  // Where GTT says the vehicle is going, and when, beats any guess about the
  // speed it has held since a sample we cannot date. The projection stays as
  // the fallback for the trips the feed says nothing about.
  const anchoredMeters = anchoredAdvanceMeters(
    routeVariant,
    progress.traveledMeters,
    Date.now() - effectiveAgeSeconds * 1000,
    tripUpdate,
  );
  // Order of preference, best evidence first: what GTT announces for this trip,
  // then what the timetable says this segment takes, then the vehicle's own
  // recent pace. The GPS position anchors all three.
  const scheduledMeters = anchoredMeters == null
    ? scheduledPaceAdvanceMeters(routeVariant, progress.traveledMeters, effectiveAgeSeconds)
    : undefined;
  const targetMeters = Math.min(
    MAX_LATENCY_COMPENSATION_METERS,
    anchoredMeters ?? scheduledMeters ?? projectedMeters,
    // Dead reckoning may not push a vehicle past its own terminus.
    Math.max(0, progress.remainingMeters - 5),
  );

  // The correction is allowed to change only by a fraction of the ground the
  // vehicle itself covers in the meantime. A marker may therefore gain on the
  // vehicle or give ground back to it, but only at the pace of the traffic it
  // is drawn in — it can no longer close half a minute in a single frame and
  // then stand waiting for reality to catch up.
  const previous = publishedAdvances.get(vehicleId);
  const sinceLastSeconds = previous ? (Date.now() - previous.atMs) / 1000 : 0;
  // A vehicle out of sight for longer than the window has no lead worth
  // carrying over, and the first sighting of one has nothing to be continuous
  // with: both take the projection as it comes.
  const allowedChangeMeters =
    previous && sinceLastSeconds > 0 && sinceLastSeconds <= 120
      ? LATENCY_ADJUST_FRACTION * speedMetersPerSecond * sinceLastSeconds
      : Number.POSITIVE_INFINITY;
  const advanceMeters = Math.min(
    (previous?.meters ?? 0) + allowedChangeMeters,
    Math.max((previous?.meters ?? 0) - allowedChangeMeters, targetMeters),
  );
  recordAdvance(vehicleId, advanceMeters);
  if (advanceMeters < 8) return { skipped: 'troppo-lento' as const };
  const compensated = interpolatePathState(
    routeVariant.path,
    Math.min(0.999999, (progress.traveledMeters + advanceMeters) / totalMeters),
  );
  return compensated
    ? {
        point: compensated.point,
        bearing: compensated.bearing,
        meters: Math.round(advanceMeters),
        // Report the delay actually recovered, which after the stops and the
        // rate limit is not the delay we set out to recover.
        seconds: Math.round(advanceMeters / speedMetersPerSecond),
        source: anchoredMeters != null
          ? ('previsione' as const)
          : scheduledMeters != null
            ? ('orario' as const)
            : ('velocita' as const),
      }
    : { skipped: 'percorso-assente' as const };
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

// A vehicle running past the last stop of its line is still a vehicle: depots,
// layovers and the odd diversion all sit slightly outside the network.
const COVERAGE_MARGIN_DEGREES = 0.15;
// Used only until the network has loaded. Wide enough to hold the whole of
// Piedmont, because its job is to reject nonsense - a null island fix, a
// vehicle reported in another country - and nothing else.
const PIEDMONT_FALLBACK_BOUNDS = { minLat: 44.0, maxLat: 46.2, minLon: 6.5, maxLon: 9.4 };

function isValidGttCoverageCoordinate(vehicle: GttVehiclePosition) {
  if (!hasNumericCoordinate(vehicle)) return false;
  // The filter is measured from the dataset rather than written by hand. The
  // hand-written one covered the city and clipped the interurban network: a
  // fifth of the stops fell outside it, so buses towards Ivrea, Susa or Asti
  // vanished from the map partway through their run.
  const bounds = getGtfsNetworkBounds() ?? PIEDMONT_FALLBACK_BOUNDS;
  return (
    vehicle.lat > bounds.minLat - COVERAGE_MARGIN_DEGREES &&
    vehicle.lat < bounds.maxLat + COVERAGE_MARGIN_DEGREES &&
    vehicle.lon > bounds.minLon - COVERAGE_MARGIN_DEGREES &&
    vehicle.lon < bounds.maxLon + COVERAGE_MARGIN_DEGREES
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
  const { speed, source: speedSource, bearing: observedBearing, recentSpeed } = observedSpeed(vehicleId || String(index), vehicle);
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
  const latencyOutcome = compensateFeedLatency(
    vehicleId || String(index),
    estimate.routeVariantId,
    displayPoint,
    recentSpeed ?? speed,
    ageSeconds,
    isSnappedToRoute,
    tripUpdate,
  );
  const latencyCompensation = 'point' in latencyOutcome ? latencyOutcome : undefined;
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
    latencyCompensationMeters: latencyCompensation?.meters,
    latencyCompensationSeconds: latencyCompensation?.seconds,
    latencyCompensationSkipped: 'skipped' in latencyOutcome ? latencyOutcome.skipped : undefined,
    latencyCompensationSource: latencyCompensation?.source,
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

// Le corse che l'orario dice in strada su linee di cui il feed non manda
// nulla. Non sono mezzi osservati: sono corse previste, e vanno dichiarate per
// quello che sono in ogni punto dell'interfaccia che le mostra.
//
// La regola per generarle è deliberatamente stretta: **una linea con anche un
// solo mezzo tracciato non ne produce nessuna.** Se il feed copre la linea, una
// corsa assente da quel feed è probabilmente una corsa che non sta circolando,
// e disegnarla sarebbe inventare un mezzo. Solo il silenzio completo su una
// linea giustifica il ricorso all'orario.
let scheduledRunsCalendar: StopScheduleCalendar | undefined;
let scheduledRunsRequested = false;

const MAX_UNVERIFIED_RUNS = 400;

// Il ritardo che la linea sta accumulando, letto dai Trip Update. Quando il
// feed delle posizioni tace, quello delle previsioni può parlare ancora: porta
// lo scarto fra orario previsto e programmato, ed è l'unico modo di sapere che
// una corsa è in ritardo senza vederla.
//
// Senza questa correzione una corsa programmata resta per definizione davanti a
// un mezzo in ritardo, e si allontana man mano che il ritardo cresce — che è
// esattamente il "sempre più avanti" che si osserva sulla mappa.
//
// Si usa la mediana e non la media: un solo aggiornamento aberrante sposterebbe
// tutte le corse della linea.
function lineDelaysFromTripUpdates(updates: GttTripUpdate[]) {
  const byLine = new Map<string, number[]>();
  for (const update of updates) {
    if (!update.routeId) continue;
    const line = lineNameForRoute(update.routeId);
    for (const stop of update.stopTimeUpdates) {
      const delay = stop.arrivalDelay ?? stop.departureDelay;
      if (delay == null || !Number.isFinite(delay)) continue;
      // Oltre l'ora non è un ritardo, è un dato sbagliato.
      if (Math.abs(delay) > 3600) continue;
      const bucket = byLine.get(line);
      if (bucket) bucket.push(delay);
      else byLine.set(line, [delay]);
    }
  }

  const median = new Map<string, number>();
  for (const [line, delays] of byLine) {
    delays.sort((a, b) => a - b);
    median.set(line, delays[Math.floor(delays.length / 2)]);
  }
  return median;
}

function unverifiedScheduledVehicles(observed: Vehicle[]): Vehicle[] {
  if (!scheduledRunsRequested) {
    scheduledRunsRequested = true;
    void loadScheduledRuns();
    void fetchStopScheduleCalendar().then((calendar) => {
      scheduledRunsCalendar = calendar;
    });
  }
  if (!peekScheduledRuns() || !scheduledRunsCalendar) return [];

  // Le previsioni non devono mai superare di numero le osservazioni. Con 294
  // mezzi nel feed e un tetto di 400 corse, la mappa risultava fatta più di
  // stime che di rilevazioni, ed è così che è stata letta: "corse grigie
  // ovunque". Sotto una certa soglia il tetto resta quello assoluto, altrimenti
  // un feed quasi muto non produrrebbe nulla proprio quando serve.
  const budget = Math.max(120, Math.min(MAX_UNVERIFIED_RUNS, observed.length));
  const coveredLines = new Set(observed.map((vehicle) => vehicle.line));
  const now = new Date();
  const delayByLine = lineDelaysFromTripUpdates(tripUpdatesCache?.updates ?? []);
  const runs = scheduledRunsInProgress(
    now,
    scheduledRunsCalendar,
    (line) => !coveredLines.has(line),
    budget,
    (line) => delayByLine.get(line) ?? 0,
  );

  const label = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  // Garanzia a valle: due corse della stessa linea non finiscono una sopra
  // l'altra qualunque cosa dica l'orario. Il generatore assegna ormai ogni
  // partenza a una variante sola, ma due calendari attivi nello stesso giorno
  // possono ancora descrivere la stessa corsa due volte, e un ammasso di
  // pallini identici sulla stessa strada è indistinguibile da un errore.
  const keptByLine = new Map<string, Array<{ lat: number; lon: number }>>();
  const MIN_SEPARATION_METERS = 250;

  return runs
    .map((run): Vehicle | undefined => {
      const routeVariant = getGtfsRouteVariant(run.routeVariantId);
      if (!routeVariant || routeVariant.path.length < 2) return undefined;
      const totalMeters = routeLengthMeters(routeVariant);
      if (totalMeters <= 0) return undefined;
      const state = interpolatePathState(routeVariant.path, Math.min(0.999999, run.meters / totalMeters));
      if (!state) return undefined;

      const near = keptByLine.get(routeVariant.line) ?? [];
      if (near.some((kept) => distanceMeters(kept, state.point) < MIN_SEPARATION_METERS)) return undefined;
      near.push(state.point);
      keptByLine.set(routeVariant.line, near);

      const vehicleType = getGtfsLine(routeVariant.line)?.vehicleType ?? 'bus';
      return {
        vehicleId: `orario-${run.routeVariantId}-${run.departureSeconds}`,
        routeId: `gtt-${routeVariant.routeId}`,
        routeShortName: routeVariant.line,
        vehicleType,
        vehicleFleetKey: vehicleType === 'tram' ? ('generic-tram' as const) : ('generic-bus' as const),
        vehicleFleetLabel: run.delaySeconds
          ? `Corsa non accertata · ritardo linea ${Math.round(run.delaySeconds / 60)} min`
          : 'Corsa non accertata',
        lat: state.point.lat,
        lon: state.point.lon,
        bearing: state.bearing,
        speed: run.speedKmh,
        updatedAt: label,
        source: 'scheduled' as const,
        status: 'unknown' as const,
        line: routeVariant.line,
        lineId: routeVariant.line,
        direction: routeVariant.headsign,
        terminalName: routeVariant.headsign,
        reliability: 0,
        progress: run.meters / totalMeters,
        routeVariantId: routeVariant.id,
        shapeId: routeVariant.shapeId,
        routeMatchStatus: 'on-route' as const,
      };
    })
    .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
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
  // Le corse non accertate si calcolano **prima** di arrendersi a un feed
  // vuoto. Calcolarle dopo le rendeva inerti proprio nel caso per cui esistono:
  // a feed muto si usciva dalla cache o senza nulla, e la mappa restava con i
  // tracciati e nessun mezzo sopra.
  const unverified = unverifiedScheduledVehicles(vehicles);

  if (vehicles.length === 0 && unverified.length === 0) {
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

  const withUnverified = [...vehicles, ...unverified];

  const snapshot = {
    vehicles: withUnverified,
    entityCount: payload.entityCount ?? vehicles.length,
    // Solo i mezzi realmente osservati: le corse non accertate non sono
    // posizioni del feed e non vanno contate come tali.
    vehiclePositionCount: payload.vehiclePositionCount ?? vehicles.length,
    checkedAt: payload.checkedAt ?? new Date().toISOString(),
  };
  try {
    // In cache vanno solo i mezzi osservati. Una corsa non accertata è valida
    // per l'istante in cui è stata calcolata: ripescarla da una cache di
    // cinque minuti fa significherebbe mostrare una posizione prevista per un
    // momento che è passato.
    localStorage.setItem(vehicleSnapshotCacheKey, JSON.stringify({ ...snapshot, vehicles }));
  } catch {
    // The live snapshot remains usable even if browser storage is unavailable.
  }
  return snapshot;
}
