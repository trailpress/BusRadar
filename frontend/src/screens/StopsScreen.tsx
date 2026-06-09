import { MapPinned } from 'lucide-react';
import { stops } from '../data/demoData';
import { LineBadge } from '../components/LineBadge';
import type { Stop } from '../types';

type Props = {
  onSelectStop: (stop: Stop) => void;
};

export function StopsScreen({ onSelectStop }: Props) {
  return (
    <main className="screen panel-screen">
      <section className="screen-header">
        <div>
          <span>Fermate demo</span>
          <h1>Fermate</h1>
        </div>
      </section>
      <section className="list-section">
        {stops.map((stop) => (
          <button className="stop-row" key={stop.id} type="button" onClick={() => onSelectStop(stop)}>
            <MapPinned size={17} />
            <div>
              <strong>{stop.name}</strong>
              <span>{stop.lat.toFixed(4)}, {stop.lon.toFixed(4)}</span>
            </div>
            <div className="stop-lines">
              {stop.lines.map((line) => <LineBadge key={line} line={line} size="sm" />)}
            </div>
          </button>
        ))}
      </section>
    </main>
  );
}
