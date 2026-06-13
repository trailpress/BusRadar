import { ArrowLeft, Clock3, MapPinned, Route as RouteIcon, Star, Timer, TramFront } from 'lucide-react';
import { useState } from 'react';
import { BusMap } from '../components/BusMap';
import { LineBadge } from '../components/LineBadge';
import { getGtfsRoutesForLine, getGtfsStopsForRoute } from '../data/gtfsNetwork';
import type { LatLng, TransitLine, Vehicle } from '../types';
import { notify } from '../utils/notify';

type Props = {
  line: TransitLine;
  vehicles: Vehicle[];
  userLocation: LatLng;
  onBack: () => void;
  onSelectVehicle: (vehicle: Vehicle) => void;
};

export function LineDetailScreen({ line, vehicles, userLocation, onBack, onSelectVehicle }: Props) {
  const [tab, setTab] = useState<'details' | 'route' | 'stops'>('route');
  const routeVariants = getGtfsRoutesForLine(line.id);
  const lineStops = routeVariants.flatMap(getGtfsStopsForRoute).filter((stop, index, list) => list.findIndex((item) => item.id === stop.id) === index);

  return (
    <main className="screen line-detail">
      <section className="line-detail-top">
        <button className="back-button" type="button" onClick={onBack} aria-label="Torna indietro">
          <ArrowLeft size={20} />
        </button>
        <strong>Linea {line.id}</strong>
        <button className="back-button" type="button" aria-label="Preferiti" onClick={() => notify(`Linea ${line.id} aggiunta ai preferiti`)}>
          <Star size={19} />
        </button>
      </section>

      <div className="segmented-tabs">
        <button className={tab === 'details' ? 'is-active' : ''} type="button" onClick={() => setTab('details')}>Dettagli</button>
        <button className={tab === 'route' ? 'is-active' : ''} type="button" onClick={() => setTab('route')}>Percorso</button>
        <button className={tab === 'stops' ? 'is-active' : ''} type="button" onClick={() => setTab('stops')}>Fermate</button>
      </div>

      <section className="line-map-panel">
        <BusMap vehicles={vehicles} selectedLine={line.id} showRouteForLine={line.id} userLocation={userLocation} onSelectVehicle={onSelectVehicle} />
      </section>

      {tab === 'route' && (
        <section className="list-section">
          <div className="route-endpoint"><LineBadge line={line.id} /> {line.direction}</div>
        </section>
      )}

      {tab === 'stops' && (
        <section className="list-section">
          <h2>Fermate</h2>
          {lineStops.map((stop) => (
            <div className="stop-row" key={stop.id}>
              <MapPinned size={17} />
              <div>
                <strong>{stop.name}</strong>
                <span>Palina {stop.code}</span>
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="stats-grid">
        <div><RouteIcon size={18} /><strong>{line.stats.lengthKm} km</strong><span>Lunghezza</span></div>
        <div><Timer size={18} /><strong>{line.stats.durationMin} min</strong><span>Tempo</span></div>
        <div><TramFront size={18} /><strong>{line.stats.tripsToday}</strong><span>Corse oggi</span></div>
        <div><Clock3 size={18} /><strong>{line.stats.firstRun} / {line.stats.lastRun}</strong><span>Primo / Ultimo</span></div>
      </section>
    </main>
  );
}
