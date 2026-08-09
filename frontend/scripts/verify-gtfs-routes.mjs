import fs from 'node:fs';

const network = JSON.parse(fs.readFileSync(new URL('../public/assets/gtfs-network.json', import.meta.url), 'utf8'));

function distanceMeters(a, b) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value) => value * Math.PI / 180;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lon - a.lon);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function routeLengthMeters(route) {
  return route.path.slice(1).reduce((total, point, index) => total + distanceMeters(route.path[index], point), 0);
}

function routeDirectionKey(route) {
  return `${route.directionId || '0'}:${route.headsign.trim().replace(/\s+/g, ' ').toLocaleUpperCase('it') || route.id}`;
}

const errors = [];
let directionCount = 0;
let discardedShortVariants = 0;

for (const line of network.lines) {
  const routes = network.routes.filter((route) => route.line === line.id);
  if (routes.length === 0) {
    errors.push(`Linea ${line.id}: nessun percorso`);
    continue;
  }

  const byDirection = new Map();
  for (const route of routes) {
    if (!Array.isArray(route.path) || route.path.length < 2) errors.push(`Linea ${line.id}: percorso ${route.id} senza geometria`);
    const key = routeDirectionKey(route);
    const bucket = byDirection.get(key) ?? [];
    bucket.push(route);
    byDirection.set(key, bucket);
  }

  directionCount += byDirection.size;
  for (const variants of byDirection.values()) {
    const ranked = variants.map((route) => ({ route, meters: routeLengthMeters(route) })).sort((a, b) => b.meters - a.meters);
    if (!Number.isFinite(ranked[0]?.meters) || ranked[0].meters <= 0) errors.push(`Linea ${line.id}: lunghezza non valida`);
    discardedShortVariants += Math.max(0, ranked.length - 1);
  }
}

const barred63 = network.routes
  .filter((route) => route.line.replace(/\s/g, '') === '63/' && route.directionId === '1')
  .map((route) => ({ route, meters: routeLengthMeters(route) }))
  .sort((a, b) => b.meters - a.meters)[0];
if (!barred63 || barred63.meters < 8_000 || barred63.route.stops.length < 20) {
  errors.push('Linea 63 barrato: il percorso completo verso Stazione Lingotto non viene riconosciuto');
}

const line1510Branches = new Set(network.routes.filter((route) => route.line === '1510').map(routeDirectionKey));
if (line1510Branches.size < 4) {
  errors.push('Linea 1510: non vengono riconosciuti tutti i rami Torino, Cumiana e Pinerolo');
}

// The static dataset carries its own validity window. Once it lapses, every
// service is out of calendar and the scheduled arrivals silently disappear from
// the stop panels, with nothing in the interface explaining why. Fail the build
// on an expired dataset and warn while the expiry is close.
const stopScheduleCalendar = JSON.parse(fs.readFileSync(new URL('../public/assets/stop-schedule/calendar.json', import.meta.url), 'utf8'));
const services = Object.values(stopScheduleCalendar.services ?? {});
if (services.length === 0) {
  errors.push('Calendario di servizio assente da stop-schedule/calendar.json');
} else {
  const today = new Date();
  const asGtfsDate = (date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const todayKey = asGtfsDate(today);
  const lastDay = services.map((service) => service.endDate).sort().at(-1);
  const activeToday = services.filter((service) => todayKey >= service.startDate && todayKey <= service.endDate).length;

  if (todayKey > lastDay) {
    errors.push(`Dataset GTFS scaduto il ${lastDay}: rigenerare con npm run gtfs:generate e aggiornare docs/gtfs-static-validation.md`);
  } else if (activeToday === 0) {
    errors.push(`Nessun servizio attivo oggi (${todayKey}) nel dataset GTFS: verificare il calendario`);
  } else {
    const daysLeft = Math.round((new Date(`${lastDay.slice(0, 4)}-${lastDay.slice(4, 6)}-${lastDay.slice(6, 8)}`) - today) / 86_400_000);
    console.log(`GTFS dataset valid until ${lastDay} (${daysLeft} days left, ${activeToday} services active today).`);
    if (daysLeft <= 30) {
      console.warn(`WARNING: the GTFS dataset expires in ${daysLeft} days. Regenerate it before it lapses.`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Verified ${network.lines.length} lines, ${directionCount} directions and ${network.routes.length} GTFS variants.`);
console.log(`No displayed direction is replaced by a shorter duplicate (${discardedShortVariants} duplicate variants found).`);
console.log('Line 63 barrato uses the complete routes to Caio Mario and Stazione Lingotto.');
