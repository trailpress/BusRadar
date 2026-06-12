import type { Vehicle } from '../types';
import { SimulationAdapter } from './adapters/SimulationAdapter';

export class TransitDataProvider {
  constructor(private readonly simulationAdapter = new SimulationAdapter()) {}

  /**
   * The MVP is intentionally locked to simulation.
   * GTFS/GTFS-RT adapters are spike-only until feed access, license and
   * attribution are verified.
   */
  readonly mode = 'simulation';

  getInitialVehicles(): Vehicle[] {
    return this.simulationAdapter.getInitialVehicles();
  }

  advanceVehicles(vehicles: Vehicle[]): Vehicle[] {
    return this.simulationAdapter.advanceVehicles(vehicles);
  }
}

export const transitDataProvider = new TransitDataProvider();
