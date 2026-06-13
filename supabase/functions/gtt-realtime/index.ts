import GtfsRealtimeBindings from 'https://esm.sh/gtfs-realtime-bindings@1.1.1';

type FeedKind = 'vehicles' | 'trips' | 'alerts';

const FEEDS: Record<FeedKind, string> = {
  vehicles: Deno.env.get('GTFS_RT_VEHICLE_POSITIONS_URL') ?? 'https://percorsieorari.gtt.to.it/das_gtfsrt/vehicle_position.aspx',
  trips: Deno.env.get('GTFS_RT_TRIP_UPDATES_URL') ?? 'https://percorsieorari.gtt.to.it/das_gtfsrt/trip_update.aspx',
  alerts: Deno.env.get('GTFS_RT_ALERTS_URL') ?? 'https://percorsieorari.gtt.to.it/das_gtfsrt/alerts.aspx',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=8, s-maxage=8',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function feedFromRequest(url: URL): FeedKind | 'all' {
  const queryFeed = url.searchParams.get('feed');
  if (queryFeed === 'vehicles' || queryFeed === 'trips' || queryFeed === 'alerts' || queryFeed === 'all') return queryFeed;

  const lastSegment = url.pathname.split('/').filter(Boolean).at(-1);
  if (lastSegment === 'vehicles' || lastSegment === 'trips' || lastSegment === 'alerts' || lastSegment === 'all') return lastSegment;

  return 'all';
}

async function downloadFeed(kind: FeedKind) {
  const response = await fetch(FEEDS[kind], {
    headers: {
      Accept: 'application/octet-stream, application/x-protobuf, */*',
      'User-Agent': 'BusRadar civic-tech realtime proxy',
    },
  });

  if (!response.ok) {
    throw new Error(`${kind} HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`${kind} feed is empty`);
  }

  return bytes;
}

function summarizeFeed(kind: FeedKind, bytes: Uint8Array) {
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
  const entity = message.entity ?? [];
  const vehicles = entity
    .filter((item) => item.vehicle?.position)
    .map((item) => ({
      entityId: item.id ?? null,
      routeId: item.vehicle?.trip?.routeId ?? null,
      vehicleId: item.vehicle?.vehicle?.id ?? null,
      vehicleLabel: item.vehicle?.vehicle?.label ?? null,
      licensePlate: item.vehicle?.vehicle?.licensePlate ?? null,
      tripId: item.vehicle?.trip?.tripId ?? null,
      lat: item.vehicle?.position?.latitude ?? null,
      lon: item.vehicle?.position?.longitude ?? null,
      bearing: item.vehicle?.position?.bearing ?? null,
      speed: item.vehicle?.position?.speed ?? null,
      timestamp: item.vehicle?.timestamp?.toString?.() ?? null,
    }));
  const tripUpdates = entity
    .filter((item) => item.tripUpdate)
    .map((item) => ({
      id: item.id ?? null,
      routeId: item.tripUpdate?.trip?.routeId ?? null,
      tripId: item.tripUpdate?.trip?.tripId ?? null,
      vehicleId: item.tripUpdate?.vehicle?.id ?? null,
      vehicleLabel: item.tripUpdate?.vehicle?.label ?? null,
      licensePlate: item.tripUpdate?.vehicle?.licensePlate ?? null,
      timestamp: item.tripUpdate?.timestamp?.toString?.() ?? null,
      stopTimeUpdates: (item.tripUpdate?.stopTimeUpdate ?? []).map((update) => ({
        stopId: update.stopId ?? null,
        stopSequence: update.stopSequence ?? null,
        arrivalDelay: update.arrival?.delay ?? null,
        arrivalTime: update.arrival?.time?.toString?.() ?? null,
        departureDelay: update.departure?.delay ?? null,
        departureTime: update.departure?.time?.toString?.() ?? null,
      })),
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
    tripUpdates,
  };
}

async function readFeed(kind: FeedKind) {
  const bytes = await downloadFeed(kind);
  return summarizeFeed(kind, bytes);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return json({ status: 'method-not-allowed' }, 405);
  }

  const url = new URL(request.url);
  const feed = feedFromRequest(url);

  try {
    if (feed === 'all') {
      const [vehicles, trips, alerts] = await Promise.all([readFeed('vehicles'), readFeed('trips'), readFeed('alerts')]);
      return json({ status: 'ok', feeds: { vehicles, trips, alerts } });
    }

    return json(await readFeed(feed));
  } catch (error) {
    return json({ status: 'proxy-error', feed, error: error instanceof Error ? error.message : String(error) }, 502);
  }
});
