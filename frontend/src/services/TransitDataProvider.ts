import type { Vehicle } from '../types';
import { SimulationAdapter } from './adapters/SimulationAdapter';

export class TransitDataProvider {
  constructor(private readonly simulationAdapter = new SimulationAdapter()) {}

  getInitialVehicles(): Vehicle[] {
    return this.simulationAdapter.getInitialVehicles();
  }

  advanceVehicles(vehicles: Vehicle[]): Vehicle[] {
    return this.simulationAdapter.advanceVehicles(vehicles);
  }
}

export const transitDataProvider = new TransitDataProvider();
