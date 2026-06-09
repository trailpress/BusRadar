import { BusFront, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Vehicle } from '../types';
import { LineBadge } from '../components/LineBadge';
import { SearchBox } from '../components/SearchBox';

type Props = {
  vehicles: Vehicle[];
  onSelectVehicle: (vehicle: Vehicle) => void;
};

export function VehiclesScreen({ vehicles, onSelectVehicle }: Props) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          vehicle.vehicleId.includes(normalized) ||
          vehicle.line.includes(normalized) ||
          vehicle.direction.toLowerCase().includes(normalized),
      ),
    [vehicles, normalized],
  );

  return (
    <main className="screen panel-screen">
      <section className="screen-header">
        <div>
          <span>Flotta locale demo</span>
          <h1>Vetture</h1>
        </div>
      </section>
      <SearchBox value={query} placeholder="Cerca numero vettura" onChange={setQuery} />
      <section className="list-section">
        {filtered.map((vehicle) => (
          <button className="vehicle-row" key={vehicle.vehicleId} type="button" onClick={() => onSelectVehicle(vehicle)}>
            <div className="row-icon">
              <BusFront size={18} />
            </div>
            <div>
              <strong>Vettura {vehicle.vehicleId}</strong>
              <span>{vehicle.direction} · {vehicle.speed} km/h · {vehicle.updatedAt}</span>
            </div>
            <LineBadge line={vehicle.line} />
            <Star size={17} className={vehicle.favorite ? 'star-on' : ''} />
          </button>
        ))}
      </section>
    </main>
  );
}
