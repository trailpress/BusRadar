export type VehicleType = 'bus' | 'tram';
export type VehicleLengthClass = 'standard' | 'articulated-18m';
export type VehicleLivery = 'urban' | 'interurban-blue' | 'electric-compact';
export type VehicleSource = 'simulation' | 'gtfs-rt';
export type VehicleStatus = 'moving' | 'stopped' | 'unknown';
export type VehicleFleetKey =
  | 'tram-serie-2800'
  | 'tram-serie-5000'
  | 'tram-serie-6000'
  | 'tram-serie-8000'
  | 'byd-k7-electric-9m'
  | 'byd-k9ub-2017-12m'
  | 'byd-k9-electric-12m'
  | 'byd-k9ud-2023-12m'
  | 'indcar-eb6-electric-6m'
  | 'bmc-neocity-9m'
  | 'iia-citymood-cng-12m'
  | 'iveco-citelis-12m'
  | 'iveco-eway-electric-12m'
  | 'iveco-eway-electric-18m'
  | 'iveco-eway-electric-18m-brt'
  | 'iveco-urbanway-cng-18m'
  | 'irisbus-citelis-18m'
  | 'mercedes-conecto-12m'
  | 'mercedes-conecto-12m-cng'
  | 'mercedes-conecto-12m-diesel'
  | 'mercedes-conecto-18m'
  | 'man-lions-city-19c-cng'
  | 'iveco-crossway-suburban'
  | 'irisbus-crossway-11m'
  | 'irisbus-crossway-12m'
  | 'iveco-crossway-line-12m'
  | 'iveco-crossway-line-2022-12m'
  | 'iveco-crossway-line-cng-12m'
  | 'irisbus-arway-15m'
  | 'iveco-mago-granturismo-9m'
  | 'generic-tram'
  | 'generic-bus';

export type TransitVehicle = {
  vehicleId: string;
  fleetNumber?: string;
  realtimeEntityId?: string;
  realtimeVehicleId?: string;
  realtimeVehicleLabel?: string;
  licensePlate?: string;
  tripId?: string;
  vehicleIdSource?: 'vehicle.id' | 'vehicle.label' | 'feed-internal';
  routeId: string;
  routeShortName: string;
  vehicleType: VehicleType;
  vehicleLengthClass?: VehicleLengthClass;
  vehicleLivery?: VehicleLivery;
  vehicleFleetLabel?: string;
  vehicleFleetKey?: VehicleFleetKey;
  // True when the vehicle type disagrees with the line's, which is what a bus
  // replacing a tram service looks like in the feed.
  isReplacementService?: boolean;
  // How far the marker was projected forward to cover the age of the sample,
  // and why it was not projected when it was not. Shown in the vehicle sheet so
  // a lag reported on the map can be read off instead of guessed at.
  latencyCompensationMeters?: number;
  latencyCompensationSeconds?: number;
  latencyCompensationSkipped?: 'non-agganciato' | 'troppo-lento' | 'campione-recente' | 'percorso-assente';
  // True when the position came from interpolating towards the stop GTT says
  // the vehicle is about to reach, rather than from projecting its speed.
  latencyCompensationAnchored?: boolean;
  routeMatchStatus?: 'on-route' | 'gps-only' | 'unmatched';
  routeVariantId?: string;
  shapeId?: string;
  offRouteMeters?: number;
  routePositionMeters?: number;
  routeLengthMeters?: number;
  stopPredictions?: Array<{
    stopId: string;
    stopSequence?: number;
    arrivalTimeMs: number;
  }>;
  lat: number;
  lon: number;
  bearing: number;
  speed: number;
  speedSource?: 'feed' | 'observed' | 'unavailable';
  feedTimestampMs?: number;
  feedAgeSeconds?: number;
  updatedAt: string;
  source: VehicleSource;
  status: VehicleStatus;

  // Compatibility fields used by the existing UI.
  line: string;
  lineId?: string;
  direction: string;
  reliability: number;
  progress: number;
  nextStop?: string;
  terminalName?: string;
  etaTerminalMinutes?: number;
  etaTerminalTimeLabel?: string;
  remainingKm?: number;
  favorite?: boolean;
};

export type RealtimeVehiclePosition = {
  id: string;
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  routeShortName?: string;
  lat: number;
  lon: number;
  bearing?: number;
  speed?: number;
  timestamp?: number;
};

export type RealtimeTripUpdate = {
  id: string;
  tripId?: string;
  routeId?: string;
  vehicleId?: string;
  stopTimeUpdates: Array<{
    stopId?: string;
    stopSequence?: number;
    arrivalDelaySeconds?: number;
    departureDelaySeconds?: number;
    arrivalTime?: number;
    departureTime?: number;
  }>;
};

export type RealtimeAlert = {
  id: string;
  activePeriods: Array<{ start?: number; end?: number }>;
  routeIds: string[];
  stopIds: string[];
  cause?: string;
  effect?: string;
  severity?: string;
  headerText?: string;
  descriptionText?: string;
};
