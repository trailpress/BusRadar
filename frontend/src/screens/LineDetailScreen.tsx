import { ArrowLeft, Clock3, MapPinned, Route as RouteIcon, Timer, TramFront } from 'lucide-react';
import { useState } from 'react';
import { BusMap } from '../components/BusMap';
import { LineBadge } from '../components/LineBadge';
import { routes, stops } from '../data/demoData';
import type { TransitLine, Vehicle } from '../types';

type Props = {
  line: TransitLine;
  vehicles: Vehicle[];
  onBack: () => void;
  onSelectVehicle: (vehicle: Vehicle) => void;
};

export function LineDetailScreen({ line, vehicles, onBack, onSelectVehicle }: Props) {
  const [tab, setTab] = useState<'details' | 'route' | 'stops'>('details');
  const route = routes.find((item) => item.id === line.routeId);
  const lineStops = route?.stops.map((stopId) => stops.find((stop) => stop.id === stopId)).filter(Boolean) ?? [];

  return (
    <main className="screen line-detail">
      <section className="line-detail-top">
        <button className="back-button" type="button" onClick={onBack} aria-label="Torna indietro">
          <ArrowLeft size={20} />
        </button>
        <LineBadge line={line.id} size="lg" />
        <div>
          <span>Direzione</span>
          <strong>{line.direction}</strong>
        </div>
      </section>

      <div className="segmented-tabs">
        <button className={tab === 'details' ? 'is-active' : ''} type="button" onClick={() => setTab('details')}>Dettagli</button>
        <button className={tab === 'route' ? 'is-active' : ''} type="button" onClick={() => setTab('route')}>Percorso</button>
        <button className={tab === 'stops' ? 'is-active' : ''} type="button" onClick={() => setTab('stops')}>Fermate</button>
      </div>

      <section className="line-map-panel">
        <BusMap vehicles={vehicles} selectedLine={line.id} showRouteForLine={line.id} onSelectVehicle={onSelectVehicle} />
      </section>

      {tab === 'details' && (
        <section className="stats-grid">
          <div><RouteIcon size={18} /><strong>{line.stats.lengthKm} km</strong><span>Lunghezza</span></div>
          <div><Timer size={18} /><strong>{line.stats.durationMin} min</strong><span>Percorrenza</span></div>
          <div><TramFront size={18} /><strong>{line.stats.tripsToday}</strong><span>Corse oggi</span></div>
          <div><Clock3 size={18} /><strong>{line.stats.firstRun} / {line.stats.lastRun}</strong><span>Primo / ultimo</span></div>
        </section>
      )}

      {tab === 'route' && (
        <section className="list-section">
          <h2>Percorso demo</h2>
          <p className="muted">Tracciato locale simulato, pronto per essere sostituito da geometrie GTFS shapes.</p>
        </section>
      )}

      {tab === 'stops' && (
        <section className="list-section">
          <h2>Fermate</h2>
          {lineStops.map((stop) => (
            <div className="stop-row" key={stop!.id}>
              <MapPinned size={17} />
              <span>{stop!.name}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
