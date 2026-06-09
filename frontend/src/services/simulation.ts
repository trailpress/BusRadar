import { routes } from '../data/demoData';
import type { Vehicle } from '../types';
import { interpolatePath } from '../utils/geo';
import { nowTime } from '../utils/format';

export function advanceVehicles(vehicles: Vehicle[]): Vehicle[] {
  return vehicles.map((vehicle) => {
    const route = routes.find((item) => item.id === vehicle.routeId);
    if (!route) return vehicle;

    const delta = 0.0025 + vehicle.speed / 70000;
    const progress = (vehicle.progress + delta) % 1;
    const point = interpolatePath(route.path, progress);
    const speedWave = Math.round(18 + ((Math.sin(progress * Math.PI * 2 + Number(vehicle.vehicleId)) + 1) / 2) * 24);

    return {
      ...vehicle,
      ...point,
      progress,
      speed: speedWave,
      updatedAt: nowTime(),
    };
  });
}

export function getNextStops(vehicle: Vehicle, count = 3) {
  const route = routes.find((item) => item.id === vehicle.routeId);
  if (!route) return [];

  const start = Math.floor(vehicle.progress * route.stops.length);
  return [...route.stops, ...route.stops].slice(start, start + count);
}
