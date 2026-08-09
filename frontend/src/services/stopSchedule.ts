// Scheduled departures, indexed by stop and split into buckets.
//
// The GTFS static schedule holds 1.67 million stop times. Organised by trip, as
// the GTFS source is, answering "what calls at this stop" means holding the
// whole dataset in the browser: 42 MB of transfer and around 107 MB of heap,
// paid by every visitor. Organised by stop and bucketed, a stop panel downloads
// one bucket of at most a few hundred kilobytes.
//
// `scripts/stop-schedule.mjs` writes these files and owns the same bucket
// function. The two must stay in agreement.

const BUCKETS = 256;

export type StopScheduleCalendar = {
  services: Record<string, { startDate: string; endDate: string; days: number[] }>;
  exceptions: Record<string, Record<string, number>>;
};

export type StopScheduleEntry = {
  serviceId: string;
  routeId: string;
  line: string;
  seconds: number;
};

type BucketPayload = {
  services: string[];
  routes: Array<[string, string]>;
  stops: Record<string, Array<[number, number, number]>>;
};

// FNV-1a over the stop id, mirroring scripts/stop-schedule.mjs.
export function stopScheduleBucket(stopId: string) {
  let hash = 0x811c9dc5;
  const value = String(stopId);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % BUCKETS;
}

let calendarCache: Promise<StopScheduleCalendar | undefined> | undefined;
const bucketCache = new Map<number, Promise<BucketPayload | undefined>>();

export function fetchStopScheduleCalendar() {
  calendarCache ??= fetch(`${import.meta.env.BASE_URL}assets/stop-schedule/calendar.json`)
    .then((response) => (response.ok ? response.json() as Promise<StopScheduleCalendar> : undefined))
    .catch(() => undefined);
  return calendarCache;
}

function fetchBucket(bucket: number) {
  let pending = bucketCache.get(bucket);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}assets/stop-schedule/${bucket}.json`)
      .then((response) => (response.ok ? response.json() as Promise<BucketPayload> : undefined))
      .catch(() => undefined);
    bucketCache.set(bucket, pending);
  }
  return pending;
}

export async function fetchStopSchedule(stopId: string): Promise<{
  calendar: StopScheduleCalendar | undefined;
  entries: StopScheduleEntry[];
}> {
  const [calendar, bucket] = await Promise.all([
    fetchStopScheduleCalendar(),
    fetchBucket(stopScheduleBucket(stopId)),
  ]);

  const raw = bucket?.stops[stopId] ?? [];
  const entries = raw.map(([serviceIndex, routeIndex, seconds]) => {
    const [routeId, line] = bucket?.routes[routeIndex] ?? ['', ''];
    return {
      serviceId: bucket?.services[serviceIndex] ?? '',
      routeId,
      line,
      seconds,
    };
  });

  return { calendar, entries };
}

// The calendar is shared by every stop, so warming it once makes the first stop
// panel cheap. It is small enough to fetch when the app is otherwise idle.
export function prefetchStopScheduleCalendar() {
  void fetchStopScheduleCalendar();
}
