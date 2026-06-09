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
          <h1>Vetture</h1>
        </div>
      </section>
      <SearchBox value={query} placeholder="Cerca vettura o numero" onChange={setQuery} />
      <div className="list-tabs">
        <button className="is-active" type="button">In servizio <span>{vehicles.length + 116}</span></button>
        <button type="button">Preferite</button>
      </div>
      <section className="list-section">
        {filtered.map((vehicle) => (
          <button className="vehicle-row" key={vehicle.vehicleId} type="button" onClick={() => onSelectVehicle(vehicle)}>
            <div className="row-icon">
              <BusFront size={18} />
            </div>
            <div>
              <strong>{vehicle.vehicleId}</strong>
              <span>{vehicle.nextStop ?? vehicle.direction}</span>
            </div>
            <LineBadge line={vehicle.line} />
            <div className="vehicle-speed">
              <strong>{vehicle.speed} km/h</strong>
              <span>{vehicle.updatedAt.slice(0, 5)}</span>
            </div>
            <Star size={17} className={vehicle.favorite ? 'star-on' : ''} />
          </button>
        ))}
      </section>
    </main>
  );
}
