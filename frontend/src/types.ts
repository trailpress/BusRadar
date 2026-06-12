import type { TransitVehicle } from './types/transit';

export type TabKey = 'map' | 'lines' | 'stops' | 'vehicles' | 'more';

export type LatLng = {
  lat: number;
  lon: number;
};

export type Vehicle = TransitVehicle;
export type { TransitVehicle, VehicleSource, VehicleStatus, VehicleType } from './types/transit';

export type TransitLine = {
  id: string;
  name: string;
  color: string;
  direction: string;
  alternateDirection: string;
  routeId: string;
  favorite?: boolean;
  stats: {
    lengthKm: number;
    durationMin: number;
    tripsToday: number;
    firstRun: string;
    lastRun: string;
  };
};

export type Stop = LatLng & {
  id: string;
  name: string;
  lines: string[];
};

export type Route = {
  id: string;
  line: string;
  path: LatLng[];
  stops: string[];
};

export type LandmarkType = 'tower' | 'station' | 'square' | 'factory' | 'park' | 'stadium' | 'hospital' | 'market' | 'bridge' | 'campus' | 'church';

export type Landmark = LatLng & {
  id: string;
  name: string;
  shortName?: string;
  type: LandmarkType;
  asset?: string;
  display?: 'image' | 'pin';
  minZoom?: number;
  labelZoom?: number;
  tier?: 'major' | 'district' | 'local';
};
