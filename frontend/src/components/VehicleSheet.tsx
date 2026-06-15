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

function vehicleDetailImage(vehicle: Vehicle) {
  const base = import.meta.env.BASE_URL;
  if (vehicle.vehicleType === 'tram') return `${base}assets/vehicles/detail/tram-3d.png`;
  if (vehicle.vehicleFleetKey === 'iveco-urbanway-cng-18m' || vehicle.vehicleFleetKey === 'iveco-eway-electric-18m') return `${base}assets/vehicles/detail/iveco-urbanway-18m-3d.png`;
  if (vehicle.vehicleFleetKey === 'mercedes-conecto-18m') return `${base}assets/vehicles/detail/mercedes-conecto-18m-3d.png`;
  if (vehicle.vehicleFleetKey === 'byd-k9-electric-12m' || vehicle.vehicleFleetKey === 'byd-k7-electric-9m') return `${base}assets/vehicles/detail/byd-electric-12m-3d.png`;
  if (vehicle.vehicleFleetKey === 'iia-citymood-cng-12m') return `${base}assets/vehicles/detail/citymood-cng-12m-3d.png`;
  if (vehicle.vehicleFleetKey === 'iveco-eway-electric-12m') return `${base}assets/vehicles/detail/electric-standard-12m-3d.png`;
  if (vehicle.vehicleLivery === 'electric-compact') return `${base}assets/vehicles/detail/byd-electric-12m-3d.png`;
  if (vehicle.vehicleLengthClass === 'articulated-18m') return `${base}assets/vehicles/detail/urban-articulated-18m-3d.png`;
  return `${base}assets/vehicles/detail/urban-standard-12m-3d.png`;
}

export function VehicleSheet({ vehicle, onFollow, onRoute, onClose }: Props) {
  const vehicleKind = vehicle.vehicleFleetLabel ?? (vehicle.vehicleType === 'tram' ? 'Tram' : vehicle.vehicleLengthClass === 'articulated-18m' ? 'Bus 18m' : 'Bus');
  const speedSource = vehicle.speedSource === 'feed' ? 'Feed realtime' : vehicle.speedSource === 'observed' ? 'Calcolata da GPS' : 'Non disponibile';
  const rawVehicleLabel = vehicle.realtimeVehicleLabel && vehicle.realtimeVehicleLabel !== vehicle.vehicleId ? vehicle.realtimeVehicleLabel : undefined;
  const detailImage = vehicleDetailImage(vehicle);
  const isInterurbanBlue = vehicle.vehicleLivery === 'interurban-blue';
  const isElectricCompact = vehicle.vehicleLivery === 'electric-compact';
  const isArticulated = vehicle.vehicleLengthClass === 'articulated-18m';
  const vehicleModelClass = [
    'vehicle-model',
    vehicle.vehicleType === 'tram' ? 'vehicle-model--tram' : 'vehicle-model--bus',
    isArticulated ? 'vehicle-model--articulated' : 'vehicle-model--standard',
    isElectricCompact ? 'vehicle-model--electric' : '',
    isInterurbanBlue ? 'vehicle-model--interurban' : '',
    vehicleKind.toLowerCase().includes('metano') ? 'vehicle-model--methane' : '',
  ].filter(Boolean).join(' ');

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
          <strong>Vettura {vehicle.vehicleId || '-'}</strong>
          <span>Linea {vehicle.routeShortName || vehicle.line} · {vehicleKind}</span>
        </div>
      </div>
      <div className="direction-block">
        <strong>Linea {vehicle.routeShortName || vehicle.line}</strong>
        <span>Direzione: {vehicle.terminalName ?? vehicle.direction}</span>
        <span>
          Vettura: {vehicle.vehicleId || '-'} · Route GTFS: {vehicle.routeId.replace(/^gtt-/, '')}
          {rawVehicleLabel ? ` · label GTFS-RT: ${rawVehicleLabel}` : ''}
          {vehicle.realtimeEntityId && vehicle.realtimeEntityId !== vehicle.vehicleId ? ` · entity: ${vehicle.realtimeEntityId}` : ''}
          {vehicle.tripId ? ` · trip: ${vehicle.tripId}` : ''}
        </span>
      </div>
      <div className="bus-photo">
        <img className="vehicle-render" src={detailImage} alt={`Rendering ${vehicleKind}`} />
        <div className={`${vehicleModelClass} vehicle-model--fallback`} aria-hidden="true">
          <i />
          <small />
          <span />
          <b />
        </div>
        <em>{vehicleKind}</em>
      </div>
      <div className="metric-grid">
        <div>
          <Gauge size={16} />
          <strong>{vehicle.speed} km/h</strong>
          <span>{speedSource}</span>
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
        <span>Stima percorso</span>
        <div className="is-current">
          <i />
          <strong>{vehicle.terminalName ?? vehicle.nextStop ?? vehicle.direction}</strong>
          <span>
            {vehicle.etaTerminalMinutes != null
              ? `Arrivo stimato ${vehicle.etaTerminalTimeLabel} · ${vehicle.etaTerminalMinutes} min · ${vehicle.remainingKm ?? 0} km`
              : 'ETA non calcolabile dal feed corrente'}
          </span>
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
