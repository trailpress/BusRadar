import { Clock3, Gauge, LocateFixed, Route as RouteIcon, Star, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { officialSpecsForFleetKey, type OfficialGttVehicleSpec } from '../data/gttOfficialFleetSpecs';
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
  basis: 'realtime' | 'position' | 'unavailable';
};

function vehicleDetailImage(vehicle: Vehicle) {
  const base = import.meta.env.BASE_URL;
  if (!vehicle.vehicleFleetKey || vehicle.vehicleFleetKey === 'generic-bus' || vehicle.vehicleFleetKey === 'generic-tram') {
    return `${base}${vehicleFleetProfile('generic-bus').detailAsset}`;
  }
  return `${base}${vehicleFleetProfile(vehicle.vehicleFleetKey).detailAsset}`;
}

function renderStatusLabel(status: ReturnType<typeof vehicleFleetProfile>['assetStatus']) {
  if (status === 'validated-render') return 'render validato';
  if (status === 'placeholder-render') return 'render non validato';
  return 'specifiche PDF ufficiale';
}

function vehicleRenderStatusLabel(vehicle: Vehicle, status: ReturnType<typeof vehicleFleetProfile>['assetStatus']) {
  if (vehicle.vehicleFleetKey === 'generic-bus' || vehicle.vehicleFleetKey === 'generic-tram') return 'modello non identificato';
  return renderStatusLabel(status);
}

function numericFleetNumber(vehicle: Vehicle) {
  const value = vehicle.fleetNumber ?? vehicle.vehicleId;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function specSeriesMatchesVehicle(series: string, vehicleNumber?: number) {
  if (!vehicleNumber) return false;
  const normalized = series.replace(/\s/g, '');
  return normalized.split(/[/,]/).some((part) => {
    const clean = part.replace(/[A-Z]/gi, '');
    const range = clean.match(/^(\d+)-(\d+)$/);
    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      return vehicleNumber >= min && vehicleNumber <= max;
    }
    const exact = clean.match(/^\d+$/);
    return exact ? Number(clean) === vehicleNumber : false;
  });
}

function officialSpecForVehicle(vehicle: Vehicle) {
  const specs = vehicle.vehicleFleetKey ? officialSpecsForFleetKey(vehicle.vehicleFleetKey) : [];
  const vehicleNumber = numericFleetNumber(vehicle);
  return specs.find((spec) => specSeriesMatchesVehicle(spec.series, vehicleNumber)) ?? specs[0];
}

function formatMillimeters(value?: number) {
  if (!value) return 'n/d';
  return `${(value / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} m`;
}

function tractionLabel(spec?: OfficialGttVehicleSpec) {
  if (!spec) return 'n/d';
  if (spec.traction === 'electric') return spec.batteryKwh ? `elettrico · ${spec.batteryKwh} kWh` : 'elettrico';
  if (spec.traction === 'cng') return 'metano CNG';
  return 'diesel';
}

function serviceClassLabel(spec?: OfficialGttVehicleSpec) {
  if (!spec) return 'classe n/d';
  if (spec.serviceClass === 'urban') return 'urbano';
  if (spec.serviceClass === 'suburban') return 'suburbano';
  if (spec.serviceClass === 'interurban') return 'extraurbano';
  if (spec.serviceClass === 'granturismo') return 'granturismo';
  if (spec.serviceClass === 'tram-line') return 'tram linea';
  return 'tram speciale';
}

function renderAvailabilityText(status: ReturnType<typeof vehicleFleetProfile>['assetStatus']) {
  if (status === 'validated-render') return 'Render 3D validato';
  if (status === 'placeholder-render') return 'Render 3D non validato';
  return 'Render 3D da produrre';
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

function VehicleServiceDisplay({ vehicle }: { vehicle: Vehicle }) {
  const route = vehicle.routeShortName || vehicle.line;
  const destination = (vehicle.terminalName ?? vehicle.direction).trim() || 'Direzione non disponibile';
  const serviceType = vehicle.vehicleType === 'tram' ? 'Tram GTT' : 'Bus GTT';

  return (
    <div className="vehicle-service-display" aria-label={`Linea ${route}, direzione ${destination}`}>
      <LineBadge line={route} size="lg" />
      <div>
        <span>Direzione</span>
        <strong>{destination}</strong>
      </div>
      <small>{serviceType}</small>
    </div>
  );
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
  const officialSpec = officialSpecForVehicle(vehicle);
  const showValidatedRender = fleetProfile.assetStatus === 'validated-render';
  const showDetailImage = showValidatedRender || (vehicle.vehicleFleetKey === 'generic-bus' && vehicle.vehicleType === 'bus');
  const fleetCardClass = ['official-fleet-card', officialSpec ? `official-fleet-card--${officialSpec.traction}` : ''].filter(Boolean).join(' ');

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
      <VehicleServiceDisplay vehicle={vehicle} />
      <div className="bus-photo">
        <span className="vehicle-operator-mark" aria-label="Operatore GTT">GTT</span>
        {showDetailImage ? (
          <div className="vehicle-render-stage">
            <img className="vehicle-render" src={detailImage} alt={`Rendering ${vehicleKind}`} />
          </div>
        ) : (
          <div className="missing-render-panel" aria-label="Render 3D non ancora validato">
            <div className="official-fleet-visual" aria-hidden="true"><i /><b /><span /></div>
            <strong>{renderAvailabilityText(fleetProfile.assetStatus)}</strong>
            <span>{officialSpec?.officialName ?? fleetProfile.label}</span>
          </div>
        )}
        <em>{vehicleKind}</em>
        <small>{vehicleRenderStatusLabel(vehicle, fleetProfile.assetStatus)}</small>
      </div>
      <div className="direction-block">
        <span>
          {vehicleIdentifierKind(vehicle)}: {vehicle.fleetNumber ?? vehicle.vehicleId} · Route GTFS: {vehicle.routeId.replace(/^gtt-/, '')}
          {rawVehicleLabel ? ` · label GTFS-RT: ${rawVehicleLabel}` : ''}
          {vehicle.realtimeEntityId && vehicle.realtimeEntityId !== vehicle.vehicleId ? ` · entity: ${vehicle.realtimeEntityId}` : ''}
          {vehicle.tripId ? ` · trip: ${vehicle.tripId}` : ''}
        </span>
        <span>{routeTrackingText(vehicle)}</span>
      </div>
      <div className={fleetCardClass} aria-label="Specifiche ufficiali del mezzo">
        <div className="official-fleet-copy">
          <div className="official-fleet-kicker">
            <span>{serviceClassLabel(officialSpec)}</span>
            <em>{showValidatedRender ? 'Render verificato' : 'Fonte PDF ufficiale'}</em>
          </div>
          <strong>{officialSpec?.officialName ?? fleetProfile.label}</strong>
          <p>Serie {officialSpec?.series ?? 'n/d'} · Scheda {officialSpec?.sheet ?? 'n/d'} · PDF p.{officialSpec?.pdfPage ?? 'n/d'}</p>
        </div>
        <dl>
          <div>
            <dt>Lunghezza</dt>
            <dd>{formatMillimeters(officialSpec?.body.lengthMm)}</dd>
          </div>
          <div>
            <dt>Porte</dt>
            <dd>{officialSpec?.body.doors ?? 'n/d'}</dd>
          </div>
          <div>
            <dt>Trazione</dt>
            <dd>{tractionLabel(officialSpec)}</dd>
          </div>
          <div>
            <dt>Anno</dt>
            <dd>{officialSpec?.year ?? 'n/d'}</dd>
          </div>
          <div>
            <dt>Vel. max</dt>
            <dd>{officialSpec?.maxSpeedKmh ? `${officialSpec.maxSpeedKmh} km/h` : 'n/d'}</dd>
          </div>
          <div>
            <dt>Assi</dt>
            <dd>{officialSpec?.body.axles ?? 'n/d'}</dd>
          </div>
        </dl>
        <small>{officialSpec?.chassis ?? fleetProfile.label}{officialSpec?.motor ? ` · ${officialSpec.motor}` : ''}</small>
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
            {headway?.basis === 'realtime'
              ? 'orari GTT live'
              : headway?.basis === 'position'
                ? 'stima stabile da posizione'
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
