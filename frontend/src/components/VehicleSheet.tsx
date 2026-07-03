import { Clock3, Gauge, LocateFixed, Route as RouteIcon, Star, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { vehicleFleetProfile } from '../data/vehicleFleet';
import type { Vehicle } from '../types';
import { vehicleIdentifierKind, vehicleIdentifierLabel } from '../utils/vehicleIdentity';
import { LineBadge } from './LineBadge';

type Props = {
  vehicle: Vehicle;
  headway?: VehicleHeadwayInfo;
  onFollow: () => void;
  onToggleFavorite: () => void;
  onRoute: () => void;
  onClose: () => void;
};

export type VehicleHeadwayPeer = {
  vehicleId: string;
  label: string;
  minutes?: number;
  distanceKm?: number;
};

export type VehicleHeadwayInfo = {
  ahead?: VehicleHeadwayPeer;
  behind?: VehicleHeadwayPeer;
  peerCount: number;
  basis: 'eta' | 'position' | 'unavailable';
};

function vehicleDetailImage(vehicle: Vehicle) {
  const base = import.meta.env.BASE_URL;
  if (!vehicle.vehicleFleetKey || vehicle.vehicleFleetKey === 'generic-bus') {
    if (vehicle.vehicleLivery === 'interurban-blue') return `${base}assets/vehicles/detail/iveco-crossway-suburban-gtt-neutral.png`;
    if (vehicle.vehicleLivery === 'electric-compact') return `${base}assets/vehicles/detail/byd-k9-electric-12m-gtt-neutral.png`;
    if (vehicle.vehicleLengthClass === 'articulated-18m') return `${base}assets/vehicles/detail/iveco-urbanway-cng-18m-gtt-neutral.png`;
  }
  return `${base}${vehicleFleetProfile(vehicle.vehicleFleetKey).detailAsset}`;
}

function renderStatusLabel(status: ReturnType<typeof vehicleFleetProfile>['assetStatus']) {
  if (status === 'validated-render') return 'render validato';
  if (status === 'placeholder-render') return 'render provvisorio';
  return 'render da validare';
}

function routeTrackingText(vehicle: Vehicle) {
  if (vehicle.routeMatchStatus === 'on-route') return 'Tracciamento GTT: posizione agganciata al percorso';
  if (vehicle.routeMatchStatus === 'gps-only') {
    const distance = vehicle.offRouteMeters != null ? ` · scarto shape ${vehicle.offRouteMeters} m` : '';
    return `Tracciamento GTT: GPS reale non forzato${distance}`;
  }
  return 'Tracciamento GTT: GPS reale, percorso non associato';
}

function cardinalDirection(bearing: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return directions[Math.round(((bearing % 360) + 360) % 360 / 45) % directions.length];
}

function formatHeadwayPeer(peer?: VehicleHeadwayPeer) {
  if (!peer) return 'Nessun mezzo rilevato';
  const minutes = peer.minutes != null ? `${peer.minutes} min` : 'tempo n/d';
  const distance = peer.distanceKm != null ? ` · ${peer.distanceKm.toFixed(1)} km` : '';
  return `${peer.label} · ${minutes}${distance}`;
}

export function VehicleSheet({ vehicle, headway, onFollow, onToggleFavorite, onRoute, onClose }: Props) {
  const previousBearingRef = useRef(vehicle.bearing);
  const [displayBearing, setDisplayBearing] = useState(vehicle.bearing);
  useEffect(() => {
    const previous = previousBearingRef.current;
    const delta = ((vehicle.bearing - previous + 540) % 360) - 180;
    previousBearingRef.current = vehicle.bearing;
    setDisplayBearing((current) => current + delta);
  }, [vehicle.bearing]);
  const vehicleKind = vehicle.vehicleFleetLabel ?? (vehicle.vehicleType === 'tram' ? 'Tram' : vehicle.vehicleLengthClass === 'articulated-18m' ? 'Bus 18m' : 'Bus');
  const speedSource = vehicle.speedSource === 'feed' ? 'Feed realtime' : vehicle.speedSource === 'observed' ? 'Calcolata da GPS' : 'Non disponibile';
  const rawVehicleLabel = vehicle.realtimeVehicleLabel && vehicle.realtimeVehicleLabel !== vehicle.vehicleId ? vehicle.realtimeVehicleLabel : undefined;
  const identifierLabel = vehicleIdentifierLabel(vehicle);
  const fleetProfile = vehicleFleetProfile(vehicle.vehicleFleetKey);
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
    <section className="vehicle-sheet" aria-label={`Dettaglio mezzo ${vehicle.vehicleId}`}>
      <div className="detail-nav">
        <button
          type="button"
          aria-label={vehicle.favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
          aria-pressed={Boolean(vehicle.favorite)}
          onClick={onToggleFavorite}
        >
          <Star size={18} className={vehicle.favorite ? 'star-on' : ''} />
        </button>
        <strong>Dettagli mezzo</strong>
        <button type="button" onClick={onClose} aria-label="Chiudi dettaglio">
          <X size={19} />
        </button>
      </div>
      <div className="sheet-title">
        <LineBadge line={vehicle.line} size="lg" />
        <div>
          <strong>{identifierLabel}</strong>
          <span>Linea {vehicle.routeShortName || vehicle.line} · {vehicleKind}</span>
        </div>
      </div>
      <div className="direction-block">
        <strong>Linea {vehicle.routeShortName || vehicle.line}</strong>
        <span>Direzione: {vehicle.terminalName ?? vehicle.direction}</span>
        <span>
          {vehicleIdentifierKind(vehicle)}: {vehicle.fleetNumber ?? vehicle.vehicleId} · Route GTFS: {vehicle.routeId.replace(/^gtt-/, '')}
          {rawVehicleLabel ? ` · label GTFS-RT: ${rawVehicleLabel}` : ''}
          {vehicle.realtimeEntityId && vehicle.realtimeEntityId !== vehicle.vehicleId ? ` · entity: ${vehicle.realtimeEntityId}` : ''}
          {vehicle.tripId ? ` · trip: ${vehicle.tripId}` : ''}
        </span>
        <span>{routeTrackingText(vehicle)}</span>
      </div>
      <div className="bus-photo">
        <span className="vehicle-operator-mark" aria-label="Operatore GTT">GTT</span>
        <img className="vehicle-render" src={detailImage} alt={`Rendering ${vehicleKind}`} />
        <div className={`${vehicleModelClass} vehicle-model--fallback`} aria-hidden="true">
          <i />
          <small />
          <span />
          <b />
        </div>
        <em>{vehicleKind}</em>
        <small>{renderStatusLabel(fleetProfile.assetStatus)}</small>
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
        <div className="heading-metric">
          <span
            className="heading-compass"
            style={{ '--vehicle-bearing': `${displayBearing}deg` } as CSSProperties}
            role="img"
            aria-label={`Direzione ${Math.round(vehicle.bearing)} gradi`}
          >
            <img src={`${import.meta.env.BASE_URL}assets/ui/compass-dial.png`} alt="" />
            <i aria-hidden="true" />
          </span>
          <strong>{Math.round(vehicle.bearing)}°</strong>
          <span>Direzione {cardinalDirection(vehicle.bearing)}</span>
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
      <div className="headway-panel">
        <div>
          <span>Intervallo turno</span>
          <em>
            {headway?.basis === 'eta'
              ? 'stima da ETA'
              : headway?.basis === 'position'
                ? 'stima da posizione'
                : 'non disponibile'}
          </em>
        </div>
        <dl>
          <div>
            <dt>Davanti</dt>
            <dd>{formatHeadwayPeer(headway?.ahead)}</dd>
          </div>
          <div>
            <dt>Dietro</dt>
            <dd>{formatHeadwayPeer(headway?.behind)}</dd>
          </div>
        </dl>
        <small>{headway?.peerCount ? `${headway.peerCount} mezzi sulla stessa linea/direzione` : 'Serve almeno un altro mezzo sulla stessa linea/direzione'}</small>
      </div>
      <div className="sheet-actions">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onFollow();
          }}
        >
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
