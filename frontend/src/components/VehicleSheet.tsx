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
  const profile = vehicleFleetProfile(vehicle.vehicleFleetKey);
  return profile.detailAsset ? `${base}${profile.detailAsset}` : undefined;
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

// A lag seen on the map is impossible to act on as an impression. These two
// lines turn it into numbers: how old the sample is, and whether the marker was
// projected forward to cover that age or why it was not.
function sampleAgeText(vehicle: Vehicle) {
  const age = vehicle.feedAgeSeconds;
  if (age == null || !Number.isFinite(age)) return vehicle.updatedAt;
  return age < 60 ? `${vehicle.updatedAt} · ${age} s fa` : `${vehicle.updatedAt} · ${Math.round(age / 60)} min fa`;
}

const latencySkipReason: Record<NonNullable<Vehicle['latencyCompensationSkipped']>, string> = {
  'non-agganciato': 'non applicata: mezzo fuori dal tracciato',
  'mezzo-fermo': 'non applicata: mezzo fermo, misurato',
  'nessuna-stima': 'non applicata: né previsione né velocità misurabile',
  'gia-in-posizione': 'non necessaria: mezzo già alla posizione prevista',
  'campione-recente': 'non necessaria: campione recente',
  'percorso-assente': 'non applicata: percorso non disponibile',
};

function latencyText(vehicle: Vehicle) {
  if (vehicle.source === 'scheduled') {
    // La direzione dell'errore è l'informazione più utile davanti a un pallino
    // grigio: chi guarda deve sapere da che parte cercare il mezzo vero.
    return 'Corsa non accertata: posizione prevista dall\u2019orario, nessun dato in tempo reale. '
      + 'Un mezzo in ritardo si trova indietro rispetto a questo punto.';
  }
  if (vehicle.latencyCompensationMeters != null) {
    const seconds = vehicle.latencyCompensationSeconds;
    // Quale delle due stime ha posizionato il mezzo: l'interpolazione verso la
    // fermata annunciata da GTT, o la proiezione della velocità tenuta.
    const source = vehicle.latencyCompensationSource === 'previsione'
      ? 'previsione fermata'
      : vehicle.latencyCompensationSource === 'orario'
        ? 'orario programmato'
        : 'velocità stimata';
    const missReason: Record<NonNullable<Vehicle['latencyAnchorMiss']>, string> = {
      'nessun-aggiornamento': 'nessuna previsione per questo mezzo',
      'previsioni-senza-orario': 'previsioni senza orario futuro',
      'fermate-non-riconosciute': 'fermate previste non sul percorso',
      'previsioni-senza-ritardo': 'previsioni senza orario né ritardo',
      'orari-non-caricati': 'orario della prossima fermata non ancora caricato',
    };
    const miss = vehicle.latencyAnchorMiss ? ` · previsione non usata: ${missReason[vehicle.latencyAnchorMiss]}` : '';
    return `Recupero ritardo feed: ${vehicle.latencyCompensationMeters} m avanti${seconds != null ? ` · ${seconds} s recuperati` : ''} · ${source}${miss}`;
  }
  const reason = vehicle.latencyCompensationSkipped;
  return `Recupero ritardo feed: ${reason ? latencySkipReason[reason] : 'non disponibile'}`;
}

function routeTrackingText(vehicle: Vehicle) {
  // Il primo controllo, non l'ultimo: dire "posizione agganciata al percorso"
  // di una corsa mai osservata sarebbe vero e ingannevole insieme.
  if (vehicle.source === 'scheduled') {
    return 'Tracciamento GTT: nessuno \u2014 la linea non risulta nel feed in tempo reale';
  }
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
  // Sulla corsa non accertata il tipo di mezzo è dedotto dalla linea, non
  // osservato: nessuno sa se quel viaggio lo sta facendo un bus o niente.
  const serviceType = vehicle.source === 'scheduled'
    ? 'Prevista dall\u2019orario'
    : vehicle.vehicleType === 'tram' ? 'Tram GTT' : 'Bus GTT';

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
  // Su una corsa non accertata la velocità viene dall'orario, non da un mezzo:
  // dire «non disponibile» accanto a un numero è una contraddizione, e il
  // numero c'è.
  const speedSource = vehicle.source === 'scheduled'
    ? 'Passo dell\u2019orario'
    : vehicle.speedSource === 'feed' ? 'Feed realtime' : vehicle.speedSource === 'observed' ? 'Calcolata da GPS' : 'Non disponibile';
  const rawVehicleLabel = vehicle.realtimeVehicleLabel && vehicle.realtimeVehicleLabel !== vehicle.vehicleId ? vehicle.realtimeVehicleLabel : undefined;
  const identifierLabel = vehicleIdentifierLabel(vehicle);
  const fleetProfile = vehicleFleetProfile(vehicle.vehicleFleetKey);
  const detailImage = vehicleDetailImage(vehicle);
  const officialSpec = officialSpecForVehicle(vehicle);
  // Su una corsa non accertata non c'e' nessun mezzo da mostrare. Disegnarne
  // uno - fosse anche il bus generico - e' l'unica cosa in tutta la scheda che
  // il lettore prende per un'osservazione, e qui non lo e': la corsa viene
  // dall'orario. Per la stessa ragione la fascia non puo' dire «render
  // verificato»: quello che sarebbe verificato e' l'immagine, non che quel
  // mezzo esista.
  const unverifiedRun = vehicle.source === 'scheduled';
  const showValidatedRender = !unverifiedRun && fleetProfile.assetStatus === 'validated-render';
  // Su una corsa non accertata l'immagine non e' quella vettura - non c'e' una
  // vettura - ma il **tipo di mezzo che quella linea usa**, dedotto dalla
  // classe di servizio e descritto dalle schede ufficiali del parco veicoli.
  // Va mostrata solo con l'etichetta che dice cos'e', mai da sola.
  const showDetailImage = Boolean(detailImage)
    && (unverifiedRun
      || showValidatedRender
      || (vehicle.vehicleFleetKey === 'generic-bus' && vehicle.vehicleType === 'bus'));
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
          <span>{unverifiedRun ? `Linea ${vehicle.routeShortName || vehicle.line}` : `Linea ${vehicle.routeShortName || vehicle.line} · ${vehicleKind}`}</span>
          {vehicle.isReplacementService ? (
            <span className="vehicle-replacement-note">
              {vehicle.vehicleType === 'bus' ? 'Bus in servizio su linea tranviaria' : 'Tram in servizio su linea bus'}
            </span>
          ) : null}
        </div>
      </div>
      <VehicleServiceDisplay vehicle={vehicle} />
      <div className="bus-photo">
        <span className="vehicle-operator-mark" aria-label="Operatore GTT">GTT</span>
        {showDetailImage && detailImage ? (
          <div className="vehicle-render-stage">
            <img
              className="vehicle-render"
              src={detailImage}
              alt={unverifiedRun
                ? `Tipo di mezzo della linea ${vehicle.routeShortName || vehicle.line}: ${fleetProfile.label}`
                : `Rendering ${vehicleKind}`}
            />
          </div>
        ) : (
          <div className="missing-render-panel" aria-label={unverifiedRun ? 'Nessun mezzo osservato' : 'Render 3D non ancora validato'}>
            <div className="official-fleet-visual" aria-hidden="true"><i /><b /><span /></div>
            <strong>{unverifiedRun ? 'Nessun mezzo osservato' : renderAvailabilityText(fleetProfile.assetStatus)}</strong>
            <span>{unverifiedRun ? 'Corsa prevista dall\u2019orario, tipo di mezzo non ancora illustrato' : (officialSpec?.officialName ?? fleetProfile.label)}</span>
          </div>
        )}
        <em>{unverifiedRun ? fleetProfile.label : vehicleKind}</em>
        <small>
          {unverifiedRun
            ? 'tipo di mezzo della linea \u00b7 nessun mezzo osservato'
            : vehicleRenderStatusLabel(vehicle, fleetProfile.assetStatus)}
        </small>
      </div>
      <div className="direction-block">
        {/* L'identificativo di una corsa non accertata lo abbiamo costruito
            noi per tenerla distinta dalle altre: non e' la matricola di un
            mezzo ne' un codice che GTT pubblica, e stamparlo qui lo fa
            sembrare l'uno o l'altro. Della corsa resta vero il percorso. */}
        <span>
          {unverifiedRun
            ? `Route GTFS: ${vehicle.routeId.replace(/^gtt-/, '')}`
            : `${vehicleIdentifierKind(vehicle)}: ${vehicle.fleetNumber ?? vehicle.vehicleId} · Route GTFS: ${vehicle.routeId.replace(/^gtt-/, '')}`}
          {unverifiedRun ? '' : rawVehicleLabel ? ` · label GTFS-RT: ${rawVehicleLabel}` : ''}
          {!unverifiedRun && vehicle.realtimeEntityId && vehicle.realtimeEntityId !== vehicle.vehicleId ? ` · entity: ${vehicle.realtimeEntityId}` : ''}
          {!unverifiedRun && vehicle.tripId ? ` · trip: ${vehicle.tripId}` : ''}
        </span>
        <span>{routeTrackingText(vehicle)} · {latencyText(vehicle)}</span>
      </div>
      {/* Su una corsa non accertata non c'e' nessun mezzo, quindi non ci sono
          specifiche: la scheda tecnica diventava una colonna di «n/d» e
          ripeteva per la terza volta che il mezzo non e' stato osservato. */}
      {unverifiedRun ? null : (
      <div className={fleetCardClass} aria-label="Specifiche ufficiali del mezzo">
          <div className="official-fleet-copy">
            <div className="official-fleet-kicker">
              <span>{serviceClassLabel(officialSpec)}</span>
              <em>{unverifiedRun ? 'Nessun mezzo osservato' : showValidatedRender ? 'Render verificato' : 'Fonte PDF ufficiale'}</em>
            </div>
            <strong>{unverifiedRun ? `Corsa programmata linea ${vehicle.line}` : (officialSpec?.officialName ?? fleetProfile.label)}</strong>
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
      )}
      <div className="metric-grid">
        <div>
          <Gauge size={16} />
          <strong>{vehicle.speed} km/h</strong>
          <span>{speedSource}</span>
        </div>
        <div>
          <Clock3 size={16} />
          <strong>{sampleAgeText(vehicle)}</strong>
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
