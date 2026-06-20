import type { Vehicle } from '../types';

export function vehicleIdentifierLabel(vehicle: Vehicle) {
  return vehicle.fleetNumber ? `Vettura ${vehicle.fleetNumber}` : `ID feed ${vehicle.vehicleId}`;
}

export function vehicleIdentifierShort(vehicle: Vehicle) {
  return vehicle.fleetNumber ?? `ID ${vehicle.vehicleId}`;
}

export function vehicleIdentifierKind(vehicle: Vehicle) {
  return vehicle.fleetNumber ? 'Matricola vettura' : 'Identificativo tecnico GTFS-RT';
}
