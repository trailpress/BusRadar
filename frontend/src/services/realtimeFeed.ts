import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type { transit_realtime } from 'gtfs-realtime-bindings';

export type RealtimeFeedKind = 'vehiclePositions' | 'tripUpdates' | 'alerts';

export type RealtimeVehiclePreview = {
  routeId: string | null;
  vehicleId: string | null;
  tripId: string | null;
  lat: number | null;
  lon: number | null;
  timestamp: string | null;
};

export type RealtimeFeedResult = {
  kind: RealtimeFeedKind;
  label: string;
  status: 'missing-config' | 'loading' | 'ok' | 'http-error' | 'network-error' | 'protobuf-error' | 'empty-feed';
  entityCount?: number;
  vehiclePositionCount?: number;
  tripUpdateCount?: number;
  alertCount?: number;
  firstVehicles?: RealtimeVehiclePreview[];
  checkedAt?: string;
  error?: string;
};

type FeedConfig = {
  kind: RealtimeFeedKind;
  label: string;
  url?: string;
};

function queryParamUrl(name: string) {
  const value = new URLSearchParams(window.location.search).get(name);
  return value ? decodeURIComponent(value) : undefined;
}

const feedConfigs: FeedConfig[] = [
  {
    kind: 'vehiclePositions',
    label: 'Vehicle Positions',
    url: queryParamUrl('gtfsVp') ?? import.meta.env.VITE_GTFS_RT_VEHICLE_POSITIONS_URL,
  },
  {
    kind: 'tripUpdates',
    label: 'Trip Updates',
    url: queryParamUrl('gtfsTu') ?? import.meta.env.VITE_GTFS_RT_TRIP_UPDATES_URL,
  },
  {
    kind: 'alerts',
    label: 'Alerts',
    url: queryParamUrl('gtfsAlerts') ?? import.meta.env.VITE_GTFS_RT_ALERTS_URL,
  },
];

export const hasRealtimeFeedConfig = feedConfigs.some((feed) => Boolean(feed.url));

function summarizeFeed(kind: RealtimeFeedKind, label: string, message: transit_realtime.IFeedMessage): RealtimeFeedResult {
  const entity = message.entity ?? [];
  return {
    kind,
    label,
    status: 'ok',
    checkedAt: new Date().toLocaleTimeString('it-IT'),
    entityCount: entity.length,
    vehiclePositionCount: entity.filter((item) => item.vehicle).length,
    tripUpdateCount: entity.filter((item) => item.tripUpdate).length,
    alertCount: entity.filter((item) => item.alert).length,
    firstVehicles: entity
      .filter((item) => item.vehicle?.position)
      .slice(0, 10)
      .map((item) => ({
        routeId: item.vehicle?.trip?.routeId ?? null,
        vehicleId: item.vehicle?.vehicle?.id ?? item.vehicle?.vehicle?.label ?? item.id ?? null,
        tripId: item.vehicle?.trip?.tripId ?? null,
        lat: item.vehicle?.position?.latitude ?? null,
        lon: item.vehicle?.position?.longitude ?? null,
        timestamp: item.vehicle?.timestamp?.toString?.() ?? null,
      })),
  };
}

async function fetchFeed({ kind, label, url }: FeedConfig): Promise<RealtimeFeedResult> {
  if (!url) {
    return {
      kind,
      label,
      status: 'missing-config',
      error: `Configura VITE_GTFS_RT_${kind === 'vehiclePositions' ? 'VEHICLE_POSITIONS' : kind === 'tripUpdates' ? 'TRIP_UPDATES' : 'ALERTS'}_URL`,
    };
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/x-protobuf,application/octet-stream,*/*' } });
  } catch (error) {
    return {
      kind,
      label,
      status: 'network-error',
      error: error instanceof Error ? error.message : String(error),
      checkedAt: new Date().toLocaleTimeString('it-IT'),
    };
  }

  if (!response.ok) {
    return {
      kind,
      label,
      status: 'http-error',
      error: `${response.status} ${response.statusText}`,
      checkedAt: new Date().toLocaleTimeString('it-IT'),
    };
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength === 0) {
    return { kind, label, status: 'empty-feed', checkedAt: new Date().toLocaleTimeString('it-IT') };
  }

  try {
    const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(body);
    return summarizeFeed(kind, label, message);
  } catch (error) {
    return {
      kind,
      label,
      status: 'protobuf-error',
      error: error instanceof Error ? error.message : String(error),
      checkedAt: new Date().toLocaleTimeString('it-IT'),
    };
  }
}

export function getRealtimeConfigSummary() {
  return feedConfigs.map((feed) => ({
    kind: feed.kind,
    label: feed.label,
    configured: Boolean(feed.url),
  }));
}

export async function fetchRealtimeFeeds() {
  return Promise.all(feedConfigs.map((feed) => fetchFeed(feed)));
}
