import { ArrowLeft, BusFront, Crosshair, Info, Navigation } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { userPosition } from '../data/demoData';
import type { Vehicle } from '../types';
import { distanceMeters } from '../utils/geo';
import { formatDistance } from '../utils/format';
import { LineBadge } from '../components/LineBadge';
import { notify } from '../utils/notify';

const radiusOptions = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
];

type Props = {
  vehicles: Vehicle[];
  onSelectVehicle: (vehicle: Vehicle) => void;
  onBack: () => void;
};

export function RadarScreen({ vehicles, onSelectVehicle, onBack }: Props) {
  const [radius, setRadius] = useState(1000);
  const matches = useMemo(
    () =>
      vehicles
        .map((vehicle) => ({ vehicle, distance: distanceMeters(userPosition, vehicle) }))
        .filter((item) => item.distance <= radius)
        .sort((a, b) => a.distance - b.distance),
    [vehicles, radius],
  );

  return (
    <main className="screen panel-screen">
      <section className="screen-header">
        <button className="plain-icon" type="button" aria-label="Indietro" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>Radar</h1>
        </div>
        <button className="plain-icon" type="button" aria-label="Informazioni" onClick={() => notify('Radar demo: posizione utente e mezzi sono simulati')}>
          <Info size={18} />
        </button>
      </section>

      <section className="radar-panel">
        <div className="radar-location"><Navigation size={14} /> Centro: La mia posizione</div>
        <div className="radar-scope">
          <div className="radar-ring ring-1" />
          <div className="radar-ring ring-2" />
          <div className="radar-ring ring-3" />
          <div className="radar-sweep" />
          <div className="radar-center">
            <Crosshair size={18} />
          </div>
          {matches.slice(0, 10).map(({ vehicle, distance }, index) => {
            const angle = (index * 47 + Number(vehicle.vehicleId)) % 360;
            const normalized = Math.min(distance / radius, 1);
            const distancePx = 26 + normalized * 104;
            return (
              <button
                key={vehicle.vehicleId}
                className="radar-dot"
                style={{ '--angle': `${angle}deg`, '--distance': `${distancePx}px` } as CSSProperties}
                type="button"
                onClick={() => onSelectVehicle(vehicle)}
                aria-label={`Apri vettura ${vehicle.vehicleId}`}
              >
                {vehicle.line}
              </button>
            );
          })}
        </div>
        <div className="radius-tabs">
          {radiusOptions.map((option) => (
            <button key={option.value} className={radius === option.value ? 'is-active' : ''} type="button" onClick={() => setRadius(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="list-section">
        <button className="radar-summary" type="button" onClick={() => notify(`${matches.length} mezzi demo nel raggio selezionato`)}>
          <span><i /> {matches.length} mezzi nel raggio di {radiusOptions.find((option) => option.value === radius)?.label}</span>
          <small>Aggiornato ora</small>
        </button>
        {matches.slice(0, 4).map(({ vehicle, distance }) => (
          <button className="vehicle-row" key={vehicle.vehicleId} type="button" onClick={() => onSelectVehicle(vehicle)}>
            <div className="row-icon">
              <BusFront size={18} />
            </div>
            <div>
              <strong>Vettura {vehicle.vehicleId}</strong>
              <span>{formatDistance(distance)} · {vehicle.direction}</span>
            </div>
            <LineBadge line={vehicle.line} />
          </button>
        ))}
      </section>
    </main>
  );
}
