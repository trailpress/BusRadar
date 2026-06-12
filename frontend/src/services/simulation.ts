import { routes } from '../data/demoData';
import type { Vehicle } from '../types';
import { interpolatePathState, pathLengthMeters } from '../utils/geo';
import { nowTime } from '../utils/format';

export function advanceVehicles(vehicles: Vehicle[]): Vehicle[] {
  return vehicles.map((vehicle) => {
    const route = routes.find((item) => item.id === vehicle.routeId);
    if (!route) return vehicle;

    const routeLength = Math.max(pathLengthMeters(route.path), 1);
    const metersPerSecond = Math.max(vehicle.speed, 8) / 3.6;
    const delta = (metersPerSecond / routeLength) * 1.15;
    const progress = (vehicle.progress + delta) % 1;
    const { point, bearing } = interpolatePathState(route.path, progress);
    const wave = (Math.sin(progress * Math.PI * 2 + Number(vehicle.vehicleId)) + 1) / 2;
    const speedWave = Math.round(12 + wave * (vehicle.vehicleType === 'tram' ? 26 : 34));
    const status = speedWave < 5 ? 'stopped' : 'moving';

    return {
      ...vehicle,
      ...point,
      bearing,
      progress,
      speed: speedWave,
      updatedAt: nowTime(),
      routeShortName: vehicle.routeShortName || vehicle.line,
      source: 'simulation',
      status,
    };
  });
}

export function getNextStops(vehicle: Vehicle, count = 3) {
  const route = routes.find((item) => item.id === vehicle.routeId);
  if (!route) return [];

  const start = Math.floor(vehicle.progress * route.stops.length);
  return [...route.stops, ...route.stops].slice(start, start + count);
}
