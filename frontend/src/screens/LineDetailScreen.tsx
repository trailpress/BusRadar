import { ArrowLeft, BusFront, Clock3, MapPinned, Route as RouteIcon, Star, Timer, TramFront } from 'lucide-react';
import { useState } from 'react';
import { BusMap } from '../components/BusMap';
import { LineBadge } from '../components/LineBadge';
import { getGtfsRoutesForLine, getGtfsStopsForRoute, gtfsNetwork, type GtfsStop } from '../data/gtfsNetwork';
import type { LatLng, TransitLine, Vehicle } from '../types';
import { isLineFavorite, setLineFavorite } from '../utils/lineFavorites';
import { notify } from '../utils/notify';
import { vehicleIdentifierLabel } from '../utils/vehicleIdentity';

type Props = {
  line: TransitLine;
  vehicles: Vehicle[];
  userLocation: LatLng;
  onBack: () => void;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onSelectStop: (stop: GtfsStop) => void;
};

export function LineDetailScreen({ line, vehicles, userLocation, onBack, onSelectVehicle, onSelectStop }: Props) {
  const [tab, setTab] = useState<'details' | 'route' | 'stops'>('route');
  const [favorite, setFavorite] = useState(() => isLineFavorite(line.id, Boolean(line.favorite)));
  const routeVariants = getGtfsRoutesForLine(line.id);
  const routeStops = routeVariants.flatMap(getGtfsStopsForRoute);
  const fallbackStops = gtfsNetwork.stops.filter((stop) => stop.lines.includes(line.id));
  const lineStops = (routeStops.length > 0 ? routeStops : fallbackStops)
    .filter((stop, index, list) => list.findIndex((item) => item.id === stop.id) === index);
  const liveVehicles = vehicles
    .filter((vehicle) => vehicle.line === line.id)
    .sort((a, b) => (a.etaTerminalMinutes ?? 999) - (b.etaTerminalMinutes ?? 999));

  const trackingText = (vehicle: Vehicle) => {
    if (vehicle.routeMatchStatus === 'on-route') return 'su percorso';
    if (vehicle.routeMatchStatus === 'gps-only') return 'GPS reale';
    return 'solo feed';
  };

  const toggleFavorite = () => {
    const nextFavorite = !favorite;
    setLineFavorite(line.id, nextFavorite);
    setFavorite(nextFavorite);
    notify(`Linea ${line.id} ${nextFavorite ? 'aggiunta ai' : 'rimossa dai'} preferiti`);
  };

  return (
    <main className="screen line-detail">
      <section className="line-detail-top">
        <button className="back-button" type="button" onClick={onBack} aria-label="Torna indietro">
          <ArrowLeft size={20} />
        </button>
        <strong>Linea {line.id}</strong>
        <button className={`back-button${favorite ? ' is-active' : ''}`} type="button" aria-label={favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'} aria-pressed={favorite} onClick={toggleFavorite}>
          <Star size={19} className={favorite ? 'star-on' : ''} />
        </button>
      </section>

      <div className="segmented-tabs" role="tablist" aria-label={`Informazioni linea ${line.id}`}>
        <button className={tab === 'details' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Dettagli</button>
        <button className={tab === 'route' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'route'} onClick={() => setTab('route')}>Percorso</button>
        <button className={tab === 'stops' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'stops'} onClick={() => setTab('stops')}>Fermate</button>
      </div>

      {tab === 'details' && (
        <>
          <section className="line-summary">
            <LineBadge line={line.id} size="lg" />
            <div>
              <strong>{line.name}</strong>
              <span>{line.direction} ↔ {line.alternateDirection}</span>
            </div>
          </section>
          <section className="line-detail-facts">
            <div><BusFront size={18} /><strong>{liveVehicles.length}</strong><span>Mezzi realtime</span></div>
            <div><RouteIcon size={18} /><strong>{routeVariants.length}</strong><span>Varianti GTFS</span></div>
            <div><MapPinned size={18} /><strong>{lineStops.length}</strong><span>Paline servite</span></div>
          </section>
          <section className="stats-grid">
            <div><RouteIcon size={18} /><strong>{line.stats.lengthKm} km</strong><span>Lunghezza</span></div>
            <div><Timer size={18} /><strong>{line.stats.durationMin || '—'} min</strong><span>Tempo programmato</span></div>
            <div><TramFront size={18} /><strong>{line.stats.tripsToday}</strong><span>Corse programmate</span></div>
            <div><Clock3 size={18} /><strong>{line.stats.firstRun} / {line.stats.lastRun}</strong><span>Primo / Ultimo</span></div>
          </section>
        </>
      )}

      {tab === 'route' && (
        <>
          <section className="line-map-panel">
            <BusMap vehicles={vehicles} selectedLine={line.id} showRouteForLine={line.id} userLocation={userLocation} onSelectVehicle={onSelectVehicle} />
          </section>
          <section className="list-section live-line-section">
            <div className="route-endpoint"><LineBadge line={line.id} /> {line.direction}</div>
            <div className="section-heading">
              <h2>Mezzi live GTT</h2>
              <span>{liveVehicles.length} live</span>
            </div>
            {liveVehicles.length > 0 ? liveVehicles.map((vehicle) => (
              <button className="line-live-vehicle" key={vehicle.vehicleId} type="button" onClick={() => onSelectVehicle(vehicle)}>
                <LineBadge line={vehicle.line} />
                <div>
                  <strong>{vehicleIdentifierLabel(vehicle)}</strong>
                  <span>{vehicle.terminalName ?? vehicle.direction}</span>
                </div>
                <em>{vehicle.speed} km/h</em>
                <small>{trackingText(vehicle)}</small>
              </button>
            )) : (
              <div className="line-live-empty">
                <strong>Nessun mezzo pubblicato ora dal feed GTFS-RT</strong>
                <span>Il percorso e le fermate restano disponibili dal GTFS statico GTT.</span>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'stops' && (
        <section className="list-section line-stops-section">
          <div className="section-heading"><h2>{lineStops.length} fermate</h2><span>Tocca una palina per i passaggi</span></div>
          {lineStops.map((stop) => (
            <button className="stop-row" type="button" key={stop.id} onClick={() => onSelectStop(stop)}>
              <MapPinned size={17} />
              <div>
                <strong>{stop.name}</strong>
                <span>Palina {stop.code}</span>
              </div>
              <small>{stop.lines.slice(0, 3).join(' · ')}</small>
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
