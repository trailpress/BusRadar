import type { RealtimeAlert, RealtimeTripUpdate, RealtimeVehiclePosition } from '../../types/transit';

type DecodedFeedMessage = {
  entity?: DecodedFeedEntity[];
};

type DecodedFeedEntity = {
  id?: string;
  vehicle?: {
    trip?: { tripId?: string; trip_id?: string; routeId?: string; route_id?: string };
    vehicle?: { id?: string; label?: string };
    position?: { latitude?: number; longitude?: number; bearing?: number; speed?: number };
    timestamp?: number;
  };
  tripUpdate?: {
    trip?: { tripId?: string; trip_id?: string; routeId?: string; route_id?: string };
    vehicle?: { id?: string; label?: string };
    stopTimeUpdate?: Array<{
      stopId?: string;
      stop_id?: string;
      stopSequence?: number;
      stop_sequence?: number;
      arrival?: { delay?: number; time?: number };
      departure?: { delay?: number; time?: number };
    }>;
  };
  alert?: {
    activePeriod?: Array<{ start?: number; end?: number }>;
    informedEntity?: Array<{
      routeId?: string;
      route_id?: string;
      stopId?: string;
      stop_id?: string;
    }>;
    cause?: string;
    effect?: string;
    severityLevel?: string;
    headerText?: { translation?: Array<{ text?: string; language?: string }> };
    descriptionText?: { translation?: Array<{ text?: string; language?: string }> };
  };
};

function pickText(value?: { translation?: Array<{ text?: string; language?: string }> }) {
  return value?.translation?.find((item) => item.language === 'it')?.text ?? value?.translation?.[0]?.text;
}

/**
 * GTFS-Realtime spike adapter.
 *
 * This class intentionally accepts already decoded FeedMessage-like objects.
 * The future production adapter may add protobuf decoding and authorized fetch
 * outside the UI boundary, after feed access and license checks are complete.
 */
export class GTFSRealtimeAdapter {
  readonly enabled = false;

  parseVehiclePositions(feed: DecodedFeedMessage): RealtimeVehiclePosition[] {
    return (feed.entity ?? []).flatMap((entity) => {
      const vehicle = entity.vehicle;
      const position = vehicle?.position;
      if (!vehicle || !position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number') {
        return [];
      }

      return [{
        id: entity.id ?? vehicle.vehicle?.id ?? vehicle.vehicle?.label ?? 'unknown',
        vehicleId: vehicle.vehicle?.id ?? vehicle.vehicle?.label ?? entity.id ?? 'unknown',
        tripId: vehicle.trip?.tripId ?? vehicle.trip?.trip_id,
        routeId: vehicle.trip?.routeId ?? vehicle.trip?.route_id,
        lat: position.latitude,
        lon: position.longitude,
        bearing: position.bearing,
        speed: position.speed,
        timestamp: vehicle.timestamp,
      }];
    });
  }

  parseTripUpdates(feed: DecodedFeedMessage): RealtimeTripUpdate[] {
    return (feed.entity ?? []).flatMap((entity) => {
      const update = entity.tripUpdate;
      if (!update) return [];

      return [{
        id: entity.id ?? update.trip?.tripId ?? update.trip?.trip_id ?? 'unknown',
        tripId: update.trip?.tripId ?? update.trip?.trip_id,
        routeId: update.trip?.routeId ?? update.trip?.route_id,
        vehicleId: update.vehicle?.id ?? update.vehicle?.label,
        stopTimeUpdates: (update.stopTimeUpdate ?? []).map((stopUpdate) => ({
          stopId: stopUpdate.stopId ?? stopUpdate.stop_id,
          stopSequence: stopUpdate.stopSequence ?? stopUpdate.stop_sequence,
          arrivalDelaySeconds: stopUpdate.arrival?.delay,
          departureDelaySeconds: stopUpdate.departure?.delay,
          arrivalTime: stopUpdate.arrival?.time,
          departureTime: stopUpdate.departure?.time,
        })),
      }];
    });
  }

  parseAlerts(feed: DecodedFeedMessage): RealtimeAlert[] {
    return (feed.entity ?? []).flatMap((entity) => {
      const alert = entity.alert;
      if (!alert) return [];

      return [{
        id: entity.id ?? 'unknown',
        activePeriods: alert.activePeriod ?? [],
        routeIds: (alert.informedEntity ?? []).flatMap((item) => item.routeId ?? item.route_id ?? []),
        stopIds: (alert.informedEntity ?? []).flatMap((item) => item.stopId ?? item.stop_id ?? []),
        cause: alert.cause,
        effect: alert.effect,
        severity: alert.severityLevel,
        headerText: pickText(alert.headerText),
        descriptionText: pickText(alert.descriptionText),
      }];
    });
  }
}
