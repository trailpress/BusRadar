export type VehicleType = 'bus' | 'tram';
export type VehicleLengthClass = 'standard' | 'articulated-18m';
export type VehicleLivery = 'urban' | 'interurban-blue' | 'electric-compact';
export type VehicleSource = 'simulation' | 'gtfs-rt';
export type VehicleStatus = 'moving' | 'stopped' | 'unknown';

export type TransitVehicle = {
  vehicleId: string;
  realtimeEntityId?: string;
  realtimeVehicleId?: string;
  realtimeVehicleLabel?: string;
  licensePlate?: string;
  vehicleIdSource?: 'vehicle.id' | 'vehicle.label';
  routeId: string;
  routeShortName: string;
  vehicleType: VehicleType;
  vehicleLengthClass?: VehicleLengthClass;
  vehicleLivery?: VehicleLivery;
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
