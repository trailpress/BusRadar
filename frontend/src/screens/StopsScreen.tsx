import { MapPinned } from 'lucide-react';
import { useMemo, useState } from 'react';
import { gtfsNetwork } from '../data/gtfsNetwork';
import { LineBadge } from '../components/LineBadge';
import { SearchBox } from '../components/SearchBox';
import type { Stop } from '../types';

type Props = {
  onSelectStop: (stop: Stop) => void;
};

export function StopsScreen({ onSelectStop }: Props) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const stops = useMemo(
    () =>
      gtfsNetwork.stops
        .filter((stop) => !normalized || stop.name.toLowerCase().includes(normalized) || stop.code.includes(normalized)),
    [normalized],
  );

  return (
    <main className="screen panel-screen">
      <section className="screen-header">
        <div>
          <span>Paline GTT</span>
          <h1>Fermate</h1>
        </div>
      </section>
      <SearchBox value={query} placeholder="Cerca fermata o palina" onChange={setQuery} />
      <section className="list-section">
        {stops.map((stop) => (
          <button className="stop-row" key={stop.id} type="button" onClick={() => onSelectStop(stop)}>
            <MapPinned size={17} />
            <div>
              <strong>{stop.name}</strong>
              <span>Palina {stop.code} · {stop.lat.toFixed(4)}, {stop.lon.toFixed(4)}</span>
            </div>
            <div className="stop-lines">
              {stop.lines.slice(0, 4).map((line) => <LineBadge key={line} line={line} size="sm" />)}
            </div>
          </button>
        ))}
      </section>
    </main>
  );
}
