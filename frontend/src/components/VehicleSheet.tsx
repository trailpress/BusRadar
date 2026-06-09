import { Clock3, Gauge, LocateFixed, Route as RouteIcon, ShieldCheck, Star, X } from 'lucide-react';
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
  const stopTimes = ['09:42', '09:44', '09:46', '09:48'];
  const stopDistances = ['120 m', '350 m', '680 m', ''];

  return (
    <section className="vehicle-sheet" aria-label={`Dettaglio vettura ${vehicle.vehicleId}`}>
      <div className="detail-nav">
        <button type="button" aria-label="Aggiungi ai preferiti">
          <Star size={18} className={vehicle.favorite ? 'star-on' : ''} />
        </button>
        <strong>Dettagli vettura</strong>
        <button type="button" onClick={onClose} aria-label="Chiudi dettaglio">
          <X size={19} />
        </button>
      </div>
      <div className="sheet-title">
        <LineBadge line={vehicle.line} size="lg" />
        <div>
          <strong>{vehicle.vehicleId}</strong>
          <span>Demo</span>
        </div>
      </div>
      <div className="direction-block">
        <strong>{vehicle.direction}</strong>
        <span>Direzione: {vehicle.direction}</span>
      </div>
      <div className="bus-photo">
        <img src={`${import.meta.env.BASE_URL}assets/demo-bus.png`} alt="" />
      </div>
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
        {[...nextStops, vehicle.direction].slice(0, 4).map((name, index) => (
          <div key={`${name}-${index}`} className={index === 3 ? 'is-current' : ''}>
            <i />
            <strong>{name}</strong>
            <span>{stopTimes[index]}</span>
            <em>{stopDistances[index]}</em>
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
