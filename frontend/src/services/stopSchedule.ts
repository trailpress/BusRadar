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
// Buckets already in memory, reachable without awaiting. The map needs the
// schedule of hundreds of vehicles on every refresh and cannot wait on the
// network for any of them: it reads what has arrived and skips the rest.
const settledBuckets = new Map<number, BucketPayload | undefined>();

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
      .catch(() => undefined)
      .then((payload) => {
        settledBuckets.set(bucket, payload);
        return payload;
      });
    bucketCache.set(bucket, pending);
  }
  return pending;
}

// Scheduled calls at a stop, but only if its bucket has already arrived.
// Returns undefined when the bucket is missing, which the caller reads as "not
// yet", never as "no service".
export function peekStopSchedule(stopId: string) {
  const bucket = settledBuckets.get(stopScheduleBucket(stopId));
  if (!bucket) return undefined;
  return (bucket.stops[stopId] ?? []).map(([serviceIndex, routeIndex, seconds]) => {
    const [routeId, line] = bucket.routes[routeIndex] ?? ['', ''];
    return { serviceId: bucket.services[serviceIndex] ?? '', routeId, line, seconds };
  });
}

export function isStopScheduleLoaded(stopId: string) {
  return settledBuckets.has(stopScheduleBucket(stopId));
}

// Warming the buckets the map is actually looking at, a couple at a time. The
// whole set is 25 MB; fetching it to place markers would undo the very problem
// the bucketing was built to solve, so the schedule improves the map gradually
// as the lines being watched settle in, and never in a burst.
const requestedBuckets = new Set<number>();
let warmingBuckets = 0;
const MAX_CONCURRENT_BUCKET_WARMUPS = 2;
// Alzato da 24. L'insieme completo è 24 MB su 256 bucket, circa 94 kB l'uno:
// questo tetto ne concede poco meno di un terzo, e solo per le fermate che i
// mezzi guardati stanno realmente avvicinando. Resta un tetto perché la mappa
// si usa in mobilità, e perché scaricare tutto per posizionare dei marker era
// esattamente il difetto che il bucketing ha corretto.
const MAX_WARMED_BUCKETS = 80;

export function requestStopSchedule(stopId: string) {
  const bucket = stopScheduleBucket(stopId);
  if (requestedBuckets.has(bucket) || bucketCache.has(bucket)) return;
  if (warmingBuckets >= MAX_CONCURRENT_BUCKET_WARMUPS) return;
  if (requestedBuckets.size >= MAX_WARMED_BUCKETS) return;
  requestedBuckets.add(bucket);
  warmingBuckets += 1;
  void fetchBucket(bucket).finally(() => {
    warmingBuckets -= 1;
  });
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
