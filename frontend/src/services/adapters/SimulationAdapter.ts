import { vehicles as seedVehicles } from '../../data/demoData';
import type { Vehicle } from '../../types';
import { advanceVehicles } from '../simulation';

export class SimulationAdapter {
  getInitialVehicles(): Vehicle[] {
    return seedVehicles.map((vehicle) => ({ ...vehicle }));
  }

  advanceVehicles(vehicles: Vehicle[]): Vehicle[] {
    return advanceVehicles(vehicles);
  }
}
