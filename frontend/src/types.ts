export type TabKey = 'map' | 'lines' | 'stops' | 'vehicles' | 'more';

export type LatLng = {
  lat: number;
  lon: number;
};

export type Vehicle = LatLng & {
  vehicleId: string;
  line: string;
  lineId?: string;
  direction: string;
  speed: number;
  updatedAt: string;
  status: 'simulated';
  reliability: number;
  progress: number;
  routeId: string;
  nextStop?: string;
  favorite?: boolean;
};

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

export type LandmarkType = 'tower' | 'station' | 'square' | 'factory' | 'park';

export type Landmark = LatLng & {
  id: string;
  name: string;
  type: LandmarkType;
  spriteIndex?: number;
  minZoom?: number;
  labelZoom?: number;
  tier?: 'major' | 'district' | 'local';
};

export type MapLayerMode = 'standard' | 'diorama';
