import type { Vehicle } from '../types';

type GttVehiclePosition = {
  routeId: string | null;
  vehicleId: string | null;
  tripId: string | null;
  lat: number | null;
  lon: number | null;
  bearing: number | null;
  speed: number | null;
  timestamp: string | null;
};

type GttVehiclesResponse = {
  status: 'ok' | string;
  entityCount?: number;
  vehiclePositionCount?: number;
  checkedAt?: string;
  vehicles?: GttVehiclePosition[];
  error?: string;
};

export type GttRealtimeSnapshot = {
  vehicles: Vehicle[];
  entityCount: number;
  vehiclePositionCount: number;
  checkedAt: string;
};

const tramRoutes = new Set(['3', '4', '9', '10', '13', '15', '16']);

function normalizeRouteName(routeId: string) {
  return routeId.replace(/U$/, '');
}

function vehicleTypeForRoute(routeId: string): Vehicle['vehicleType'] {
  const routeName = normalizeRouteName(routeId).replace(/\D/g, '');
  return tramRoutes.has(routeName) ? 'tram' : 'bus';
}

function formatTimestamp(timestamp: string | null) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  return new Date(seconds * 1000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function speedKmh(speedMetersPerSecond: number | null) {
  if (!Number.isFinite(speedMetersPerSecond)) return 0;
  return Math.max(0, Math.round((speedMetersPerSecond ?? 0) * 3.6));
}

function isValidTorinoCoordinate(vehicle: GttVehiclePosition) {
  return (
    typeof vehicle.lat === 'number' &&
    typeof vehicle.lon === 'number' &&
    vehicle.lat > 44.7 &&
    vehicle.lat < 45.3 &&
    vehicle.lon > 7.3 &&
    vehicle.lon < 8.1
  );
}

function toVehicle(vehicle: GttVehiclePosition, index: number): Vehicle {
  const routeId = vehicle.routeId || 'GTT';
  const line = normalizeRouteName(routeId);
  const speed = speedKmh(vehicle.speed);

  return {
    vehicleId: vehicle.vehicleId || `GTT-${index}`,
    routeId: `gtt-${routeId}`,
    routeShortName: line,
    vehicleType: vehicleTypeForRoute(routeId),
    lat: vehicle.lat ?? 0,
    lon: vehicle.lon ?? 0,
    bearing: vehicle.bearing ?? 0,
    speed,
    updatedAt: formatTimestamp(vehicle.timestamp),
    source: 'gtfs-rt',
    status: speed > 1 ? 'moving' : 'unknown',
    line,
    lineId: line,
    direction: `Linea ${line}`,
    reliability: 100,
    progress: 0,
    nextStop: vehicle.tripId ? `Trip ${vehicle.tripId}` : undefined,
  };
}

export async function fetchGttRealtimeVehicles(): Promise<GttRealtimeSnapshot | undefined> {
  let response: Response;
  try {
    response = await fetch('/api/gtt/realtime/vehicles');
  } catch {
    return undefined;
  }

  if (!response.ok) return undefined;

  const payload = (await response.json()) as GttVehiclesResponse;
  if (payload.status !== 'ok' || !Array.isArray(payload.vehicles)) return undefined;

  const vehicles = payload.vehicles.filter(isValidTorinoCoordinate).map(toVehicle);
  if (vehicles.length === 0) return undefined;

  return {
    vehicles,
    entityCount: payload.entityCount ?? vehicles.length,
    vehiclePositionCount: payload.vehiclePositionCount ?? vehicles.length,
    checkedAt: payload.checkedAt ?? new Date().toISOString(),
  };
}
