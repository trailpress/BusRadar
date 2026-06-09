import { BusFront, Clock3, Gauge, LocateFixed, Route as RouteIcon, ShieldCheck } from 'lucide-react';
import { stops } from '../data/demoData';
import { getNextStops } from '../services/simulation';
import type { Vehicle } from '../types';
import { LineBadge } from './LineBadge';

type Props = {
  vehicle: Vehicle;
  onFollow: () => void;
  onRoute: () => void;
  onClose: () => void;
};

export function VehicleSheet({ vehicle, onFollow, onRoute, onClose }: Props) {
  const nextStops = getNextStops(vehicle).map((stopId) => stops.find((stop) => stop.id === stopId)?.name ?? stopId);

  return (
    <section className="vehicle-sheet" aria-label={`Dettaglio vettura ${vehicle.vehicleId}`}>
      <div className="sheet-handle" />
      <div className="sheet-title">
        <div className="vehicle-title-icon">
          <BusFront size={20} />
        </div>
        <div>
          <span>Vettura</span>
          <strong>{vehicle.vehicleId}</strong>
        </div>
        <LineBadge line={vehicle.line} size="lg" />
        <button className="sheet-close" type="button" onClick={onClose} aria-label="Chiudi dettaglio">
          ×
        </button>
      </div>
      <p className="muted">Direzione {vehicle.direction}</p>
      <div className="metric-grid">
        <div>
          <Gauge size={16} />
          <strong>{vehicle.speed} km/h</strong>
          <span>Velocità</span>
        </div>
        <div>
          <Clock3 size={16} />
          <strong>{vehicle.updatedAt}</strong>
          <span>Ultimo update</span>
        </div>
        <div>
          <ShieldCheck size={16} />
          <strong>{vehicle.reliability}%</strong>
          <span>Affidabilità</span>
        </div>
      </div>
      <div className="next-stops">
        <span>Prossime fermate</span>
        {nextStops.map((name) => (
          <div key={name}>
            <i />
            {name}
          </div>
        ))}
      </div>
      <div className="sheet-actions">
        <button type="button" onClick={onFollow}>
          <LocateFixed size={17} />
          Segui vettura
        </button>
        <button type="button" className="secondary" onClick={onRoute}>
          <RouteIcon size={17} />
          Mostra percorso
        </button>
      </div>
    </section>
  );
}
