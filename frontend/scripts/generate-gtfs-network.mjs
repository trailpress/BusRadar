import fs from 'node:fs';
import path from 'node:path';

const gtfsDir = process.env.GTFS_STATIC_DIR;

if (!gtfsDir) {
  console.error('Set GTFS_STATIC_DIR to an extracted GTFS folder.');
  process.exit(1);
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function readCsv(fileName) {
  const raw = fs.readFileSync(path.join(gtfsDir, fileName), 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function simplify(points, step = 2) {
  if (points.length <= 260) return points;
  const simplified = points.filter((_, index) => index === 0 || index === points.length - 1 || index % step === 0);
  return simplified.length > 900 ? simplify(simplified, step + 1) : simplified;
}

function cleanLineName(routeShortName, routeId) {
  return routeShortName || routeId.replace(/U$/, '');
}

function lineType(routeType) {
  return routeType === '0' ? 'tram' : 'bus';
}

function colorForRoute(route) {
  const fromFeed = route.route_color && route.route_color !== 'FFFFFF' ? `#${route.route_color}` : '';
  if (fromFeed) return fromFeed;
  return route.route_type === '0' ? '#2563EB' : '#10B981';
}

const routes = readCsv('routes.txt');
const trips = readCsv('trips.txt');
const shapes = readCsv('shapes.txt');
const stops = readCsv('stops.txt');
const stopTimes = readCsv('stop_times.txt');

const routeById = new Map(routes.map((route) => [route.route_id, route]));
const tripsByRouteDirection = new Map();
const tripsById = new Map();

for (const trip of trips) {
  tripsById.set(trip.trip_id, trip);
  const key = `${trip.route_id}::${trip.direction_id || '0'}`;
  const bucket = tripsByRouteDirection.get(key) ?? [];
  bucket.push(trip);
  tripsByRouteDirection.set(key, bucket);
}

function pickRepresentativeTrips(routeId, directionId, limit = 2) {
  const bucket = tripsByRouteDirection.get(`${routeId}::${directionId}`) ?? [];
  if (bucket.length === 0) return [];

  const shapeCounts = new Map();
  for (const trip of bucket) {
    if (!trip.shape_id) continue;
    shapeCounts.set(trip.shape_id, (shapeCounts.get(trip.shape_id) ?? 0) + 1);
  }

  const shapeIds = [...shapeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([shapeId]) => shapeId);
  return shapeIds.map((shapeId) => bucket.find((trip) => trip.shape_id === shapeId)).filter(Boolean);
}

const selectedTrips = [];
for (const route of routes) {
  const variants = [...pickRepresentativeTrips(route.route_id, '0'), ...pickRepresentativeTrips(route.route_id, '1')];
  for (const trip of variants) {
    if (!selectedTrips.some((item) => item.shape_id === trip.shape_id && item.route_id === trip.route_id)) selectedTrips.push(trip);
  }
}

const selectedShapeIds = new Set(selectedTrips.map((trip) => trip.shape_id).filter(Boolean));
const shapePoints = new Map();
for (const point of shapes) {
  if (!selectedShapeIds.has(point.shape_id)) continue;
  const bucket = shapePoints.get(point.shape_id) ?? [];
  bucket.push({
    lat: Number(point.shape_pt_lat),
    lon: Number(point.shape_pt_lon),
    seq: Number(point.shape_pt_sequence),
  });
  shapePoints.set(point.shape_id, bucket);
}

const stopById = new Map(
  stops.map((stop) => [
    stop.stop_id,
    {
      id: stop.stop_id,
      code: stop.stop_code,
      name: stop.stop_name.replace(/^Fermata\s+\d+\s+-\s+/i, ''),
      lat: Number(stop.stop_lat),
      lon: Number(stop.stop_lon),
      url: stop.stop_url,
      lines: [],
    },
  ]),
);

const stopTimesByTrip = new Map();
const tripStopIndex = {};
for (const stopTime of stopTimes) {
  const trip = tripsById.get(stopTime.trip_id);
  if (!trip) continue;
  const route = routeById.get(trip.route_id);
  const shortName = cleanLineName(route?.route_short_name ?? '', trip.route_id);
  const stop = stopById.get(stopTime.stop_id);
  if (stop && !stop.lines.includes(shortName)) stop.lines.push(shortName);

  const tripIndex = tripStopIndex[stopTime.trip_id] ?? {
    routeId: trip.route_id,
    line: shortName,
    stops: [],
  };
  tripIndex.stops.push([Number(stopTime.stop_sequence), stopTime.stop_id]);
  tripStopIndex[stopTime.trip_id] = tripIndex;

  const selected = selectedTrips.some((item) => item.trip_id === stopTime.trip_id);
  if (!selected) continue;
  const bucket = stopTimesByTrip.get(stopTime.trip_id) ?? [];
  bucket.push({
    stopId: stopTime.stop_id,
    sequence: Number(stopTime.stop_sequence),
  });
  stopTimesByTrip.set(stopTime.trip_id, bucket);
}

const networkRoutes = selectedTrips
  .map((trip) => {
    const route = routeById.get(trip.route_id);
    const points = shapePoints.get(trip.shape_id)?.sort((a, b) => a.seq - b.seq) ?? [];
    const stopEntries = (stopTimesByTrip.get(trip.trip_id) ?? []).sort((a, b) => a.sequence - b.sequence);
    const stopIds = stopEntries.map((item) => item.stopId);
    const shortName = cleanLineName(route?.route_short_name ?? '', trip.route_id);

    for (const stopId of stopIds) {
      const stop = stopById.get(stopId);
      if (stop && !stop.lines.includes(shortName)) stop.lines.push(shortName);
    }

    return {
      id: `${trip.route_id}-${trip.direction_id || '0'}`,
      routeId: trip.route_id,
      line: shortName,
      directionId: trip.direction_id || '0',
      headsign: trip.trip_headsign || route?.route_long_name || shortName,
      shapeId: trip.shape_id,
      vehicleType: lineType(route?.route_type ?? '3'),
      color: colorForRoute(route ?? {}),
      path: simplify(points).map(({ lat, lon }) => ({ lat, lon })),
      stops: stopIds,
      stopEntries,
    };
  })
  .filter((route) => route.path.length > 1);

for (const trip of Object.values(tripStopIndex)) {
  trip.stops.sort((a, b) => a[0] - b[0]);
}

const networkStops = [...stopById.values()]
  .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
  .sort((a, b) => Number(a.code) - Number(b.code));

const networkLines = routes
  .filter((route) => networkRoutes.some((networkRoute) => networkRoute.routeId === route.route_id))
  .map((route) => {
    const line = cleanLineName(route.route_short_name, route.route_id);
    const routeVariants = networkRoutes.filter((networkRoute) => networkRoute.routeId === route.route_id);
    return {
      id: line,
      routeId: route.route_id,
      name: route.route_long_name || `Linea ${line}`,
      color: colorForRoute(route),
      vehicleType: lineType(route.route_type),
      direction: routeVariants[0]?.headsign ?? route.route_long_name ?? line,
      alternateDirection: routeVariants[1]?.headsign ?? route.route_desc ?? '',
      stats: {
        lengthKm: Math.round(routeVariants.reduce((total, variant) => total + variant.path.length, 0) / Math.max(routeVariants.length, 1) / 10) / 10,
        durationMin: 0,
        tripsToday: trips.filter((trip) => trip.route_id === route.route_id).length,
        firstRun: '--:--',
        lastRun: '--:--',
      },
    };
  })
  .sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')) || a.id.localeCompare(b.id));

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'GTT GTFS static',
  lines: networkLines,
  routes: networkRoutes,
  stops: networkStops,
};

const outFile = path.join(process.cwd(), 'src/data/gtfsNetwork.generated.ts');
fs.writeFileSync(
  outFile,
  `// Generated from GTT GTFS static. Do not edit by hand.\nimport type { GtfsNetwork } from './gtfsNetwork';\n\nexport const gtfsNetwork = ${JSON.stringify(payload)} as const satisfies GtfsNetwork;\n`,
);

fs.mkdirSync(path.join(process.cwd(), 'public/assets'), { recursive: true });
fs.writeFileSync(
  path.join(process.cwd(), 'public/assets/gtfs-stop-times.json'),
  JSON.stringify({
    generatedAt: payload.generatedAt,
    source: 'GTT GTFS static stop_times.txt',
    trips: tripStopIndex,
  }),
);

console.log(`Generated ${networkLines.length} lines, ${networkRoutes.length} route variants, ${networkStops.length} stops`);
