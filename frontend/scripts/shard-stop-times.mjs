// Rebuilds the sharded stop schedule from the monolithic stop times index.
//
// The monolithic file is organised by trip, so answering "what calls at this
// stop" requires the whole 42 MB in the browser. The sharded form is organised
// by stop and split into buckets, so a stop panel downloads one bucket of a few
// hundred kilobytes instead.
//
// `npm run gtfs:generate` writes the sharded form directly. This script exists
// to rebuild it from an existing monolith, without re-reading the GTFS source.

import fs from 'node:fs';
import path from 'node:path';
import { STOP_SCHEDULE_BUCKETS, stopScheduleBucket, writeStopSchedule } from './stop-schedule.mjs';

const root = process.cwd();
const monolithPath = path.join(root, 'public/assets/gtfs-stop-times.json');

if (!fs.existsSync(monolithPath)) {
  console.error('public/assets/gtfs-stop-times.json not found. Run npm run gtfs:generate instead.');
  process.exit(1);
}

const monolith = JSON.parse(fs.readFileSync(monolithPath, 'utf8'));
const trips = monolith.trips ?? {};

// stopId -> [[serviceId, routeId, line, seconds], ...]
const byStop = new Map();
let entryCount = 0;

for (const trip of Object.values(trips)) {
  const { routeId = '', line = '', serviceId = '', stops = [] } = trip;
  for (const [, stopId, departureSeconds = -1, arrivalSeconds = -1] of stops) {
    const seconds = departureSeconds >= 0 ? departureSeconds : arrivalSeconds;
    if (!stopId || seconds < 0) continue;
    if (!byStop.has(stopId)) byStop.set(stopId, []);
    byStop.get(stopId).push([serviceId, routeId, line, seconds]);
    entryCount += 1;
  }
}

const written = writeStopSchedule(root, {
  generatedAt: monolith.generatedAt,
  source: monolith.source,
  calendar: monolith.calendar,
  byStop,
});

console.log(`Sharded ${entryCount} stop times for ${byStop.size} stops into ${STOP_SCHEDULE_BUCKETS} buckets.`);
console.log(`Largest bucket: ${Math.round(written.largestBucketBytes / 1024)} kB. Calendar: ${Math.round(written.calendarBytes / 1024)} kB.`);
console.log(`Bucket of stop 3021: ${stopScheduleBucket('3021')}`);
