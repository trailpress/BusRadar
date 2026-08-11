import type { Vehicle } from '../types';

// Una corsa non accertata non ha un mezzo: nessuno l'ha vista, e il suo
// identificativo se lo e' inventato l'app per tenerne traccia fra un
// aggiornamento e l'altro. Mostrarlo come «ID feed» diceva due bugie in tre
// parole - che ci fosse un mezzo, e che il feed ne avesse parlato - e riempiva
// il titolo della scheda con una stringa illeggibile.
function isUnverifiedRun(vehicle: Vehicle) {
  return vehicle.source === 'scheduled';
}

export function vehicleIdentifierLabel(vehicle: Vehicle) {
  if (isUnverifiedRun(vehicle)) return `Corsa ${vehicle.line} non accertata`;
  return vehicle.fleetNumber ? `Vettura ${vehicle.fleetNumber}` : `ID feed ${vehicle.vehicleId}`;
}

export function vehicleIdentifierShort(vehicle: Vehicle) {
  if (isUnverifiedRun(vehicle)) return `Corsa ${vehicle.line}`;
  return vehicle.fleetNumber ?? `ID ${vehicle.vehicleId}`;
}

export function vehicleIdentifierKind(vehicle: Vehicle) {
  if (isUnverifiedRun(vehicle)) return 'Corsa programmata, nessun mezzo osservato';
  return vehicle.fleetNumber ? 'Matricola vettura' : 'Identificativo tecnico GTFS-RT';
}
