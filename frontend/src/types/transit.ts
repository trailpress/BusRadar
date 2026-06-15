export type VehicleType = 'bus' | 'tram';
export type VehicleLengthClass = 'standard' | 'articulated-18m';
export type VehicleLivery = 'urban' | 'interurban-blue' | 'electric-compact';
export type VehicleSource = 'simulation' | 'gtfs-rt';
export type VehicleStatus = 'moving' | 'stopped' | 'unknown';
export type VehicleFleetKey =
  | 'tram'
  | 'byd-k7-electric-9m'
  | 'byd-k9-electric-12m'
  | 'iia-citymood-cng-12m'
  | 'iveco-citelis-12m'
  | 'iveco-eway-electric-12m'
  | 'iveco-eway-electric-18m'
  | 'iveco-urbanway-cng-18m'
  | 'irisbus-citelis-18m'
  | 'mercedes-conecto-12m'
  | 'mercedes-conecto-18m'
  | 'iveco-crossway-suburban'
  | 'generic-bus';

export type TransitVehicle = {
  vehicleId: string;
  realtimeEntityId?: string;
  realtimeVehicleId?: string;
  realtimeVehicleLabel?: string;
  licensePlate?: string;
  tripId?: string;
  vehicleIdSource?: 'vehicle.id' | 'vehicle.label';
  routeId: string;
  routeShortName: string;
  vehicleType: VehicleType;
  vehicleLengthClass?: VehicleLengthClass;
  vehicleLivery?: VehicleLivery;
  vehicleFleetLabel?: string;
  vehicleFleetKey?: VehicleFleetKey;
  lat: number;
  lon: number;
  bearing: number;
  speed: number;
  speedSource?: 'feed' | 'observed' | 'unavailable';
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
