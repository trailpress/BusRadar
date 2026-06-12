export type VehicleType = 'bus' | 'tram';
export type VehicleSource = 'simulation' | 'gtfs-rt';
export type VehicleStatus = 'moving' | 'stopped' | 'unknown';

export type TransitVehicle = {
  vehicleId: string;
  routeId: string;
  routeShortName: string;
  vehicleType: VehicleType;
  lat: number;
  lon: number;
  bearing: number;
  speed: number;
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
  favorite?: boolean;
};
