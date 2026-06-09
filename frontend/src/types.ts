export type TabKey = 'map' | 'lines' | 'stops' | 'vehicles' | 'more';

export type LatLng = {
  lat: number;
  lon: number;
};

export type Vehicle = LatLng & {
  vehicleId: string;
  line: string;
  direction: string;
  speed: number;
  updatedAt: string;
  status: 'simulated';
  reliability: number;
  progress: number;
  routeId: string;
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
