import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const execFileAsync = promisify(execFile);

const gttFeeds = {
  vehicles: 'https://percorsieorari.gtt.to.it/das_gtfsrt/vehicle_position.aspx',
  trips: 'https://percorsieorari.gtt.to.it/das_gtfsrt/trip_update.aspx',
  alerts: 'https://percorsieorari.gtt.to.it/das_gtfsrt/alerts.aspx',
} as const;

type FeedKind = keyof typeof gttFeeds;

async function downloadFeed(url: string) {
  // Node fetch has DNS trouble with this legacy IIS host in some dev environments.
  // Curl resolves it reliably, so the dev proxy uses curl server-side.
  const { stdout } = await execFileAsync('curl', ['-L', '--silent', '--show-error', '--max-time', '15', url], {
    encoding: 'buffer',
    maxBuffer: 2 * 1024 * 1024,
  });
  return new Uint8Array(stdout);
}

function summarizeFeed(kind: FeedKind, bytes: Uint8Array) {
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
  const entity = message.entity ?? [];
  const vehicles = entity
    .filter((item) => item.vehicle?.position)
    .map((item) => ({
      routeId: item.vehicle?.trip?.routeId ?? null,
      vehicleId: item.vehicle?.vehicle?.id ?? item.vehicle?.vehicle?.label ?? item.id ?? null,
      tripId: item.vehicle?.trip?.tripId ?? null,
      lat: item.vehicle?.position?.latitude ?? null,
      lon: item.vehicle?.position?.longitude ?? null,
      bearing: item.vehicle?.position?.bearing ?? null,
      speed: item.vehicle?.position?.speed ?? null,
      timestamp: item.vehicle?.timestamp?.toString?.() ?? null,
    }));

  return {
    kind,
    status: 'ok',
    bytes: bytes.byteLength,
    checkedAt: new Date().toISOString(),
    header: {
      gtfsRealtimeVersion: message.header?.gtfsRealtimeVersion,
      incrementality: message.header?.incrementality,
      timestamp: message.header?.timestamp?.toString?.() ?? message.header?.timestamp,
    },
    entityCount: entity.length,
    vehiclePositionCount: entity.filter((item) => item.vehicle).length,
    tripUpdateCount: entity.filter((item) => item.tripUpdate).length,
    alertCount: entity.filter((item) => item.alert).length,
    vehicles,
    firstVehicles: vehicles.slice(0, 10),
  };
}

async function readGttFeed(kind: FeedKind) {
  const bytes = await downloadFeed(gttFeeds[kind]);
  return summarizeFeed(kind, bytes);
}

function gttRealtimeProxy() {
  return {
    name: 'gtt-realtime-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gtt/realtime', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const pathname = req.url?.split('?')[0] ?? '/';
          if (pathname === '/vehicles') {
            res.end(JSON.stringify(await readGttFeed('vehicles')));
            return;
          }
          if (pathname === '/trips') {
            res.end(JSON.stringify(await readGttFeed('trips')));
            return;
          }
          if (pathname === '/alerts') {
            res.end(JSON.stringify(await readGttFeed('alerts')));
            return;
          }
          if (pathname === '/all' || pathname === '/') {
            const [vehicles, trips, alerts] = await Promise.all([readGttFeed('vehicles'), readGttFeed('trips'), readGttFeed('alerts')]);
            res.end(JSON.stringify({ status: 'ok', feeds: { vehicles, trips, alerts } }));
            return;
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ status: 'not-found' }));
        } catch (error) {
          res.statusCode = 502;
          res.end(JSON.stringify({ status: 'proxy-error', error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

export default defineConfig({
  base: '/BusRadar/',
  plugins: [react(), gttRealtimeProxy()],
});
