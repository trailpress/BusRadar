import { BusFront, Star, TrainFront } from 'lucide-react';
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
  const [mode, setMode] = useState<'service' | 'favorites'>('service');
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      vehicles
        .filter((vehicle) => mode === 'service' || vehicle.favorite)
        .filter(
          (vehicle) =>
            vehicle.vehicleId.includes(normalized) ||
            vehicle.line.includes(normalized) ||
            vehicle.direction.toLowerCase().includes(normalized),
        ),
    [vehicles, normalized, mode],
  );
  const vehicleKind = (vehicle: Vehicle) => (
    vehicle.vehicleType === 'tram'
      ? 'Tram'
      : `${vehicle.vehicleLengthClass === 'articulated-18m' ? 'Bus 18m' : 'Bus'}${
        vehicle.vehicleLivery === 'interurban-blue' ? ' suburbano blu' : vehicle.vehicleLivery === 'electric-compact' ? ' elettrico compatto' : ''
      }`
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
        <button className={mode === 'service' ? 'is-active' : ''} type="button" onClick={() => setMode('service')}>In servizio <span>{vehicles.length}</span></button>
        <button className={mode === 'favorites' ? 'is-active' : ''} type="button" onClick={() => setMode('favorites')}>Preferite</button>
      </div>
      <section className="list-section">
        {filtered.map((vehicle) => (
          <button className="vehicle-row" key={vehicle.vehicleId} type="button" onClick={() => onSelectVehicle(vehicle)}>
            <div className="row-icon">
              {vehicle.vehicleType === 'tram' ? <TrainFront size={18} /> : <BusFront size={18} />}
            </div>
            <div>
              <strong>{vehicle.vehicleId}</strong>
              <span>{vehicleKind(vehicle)} · {vehicle.nextStop ?? vehicle.direction}</span>
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
