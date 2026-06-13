import { Clock3, Gauge, LocateFixed, Route as RouteIcon, ShieldCheck, Star, X } from 'lucide-react';
import type { Vehicle } from '../types';
import { notify } from '../utils/notify';
import { LineBadge } from './LineBadge';

type Props = {
  vehicle: Vehicle;
  onFollow: () => void;
  onRoute: () => void;
  onClose: () => void;
};

export function VehicleSheet({ vehicle, onFollow, onRoute, onClose }: Props) {
  const vehicleAsset = `${import.meta.env.BASE_URL}assets/vehicles/${vehicle.vehicleType === 'tram' ? 'tram-top.png' : 'bus-top.png'}`;

  return (
    <section className="vehicle-sheet" aria-label={`Dettaglio vettura ${vehicle.vehicleId}`}>
      <div className="detail-nav">
        <button type="button" aria-label="Aggiungi ai preferiti" onClick={() => notify(`Vettura ${vehicle.vehicleId} aggiunta ai preferiti`)}>
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
          <span>{vehicle.vehicleType === 'tram' ? 'Tram' : 'Bus'} · {vehicle.source === 'gtfs-rt' ? 'GTFS-RT reale' : 'dato non realtime'}</span>
        </div>
      </div>
      <div className="direction-block">
        <strong>{vehicle.direction}</strong>
        <span>Direzione: {vehicle.direction}</span>
      </div>
      <div className="bus-photo">
        <img src={vehicleAsset} alt="" />
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
          <strong>{Math.round(vehicle.bearing)}°</strong>
          <span>Direzione marcia</span>
        </div>
      </div>
      <div className="next-stops">
        <span>Dati percorso</span>
        <div className="is-current">
          <i />
          <strong>{vehicle.nextStop ?? vehicle.direction}</strong>
          <span>{vehicle.source === 'gtfs-rt' ? 'Realtime GTT' : 'Dato non realtime'}</span>
          <em>{vehicle.routeShortName}</em>
        </div>
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
