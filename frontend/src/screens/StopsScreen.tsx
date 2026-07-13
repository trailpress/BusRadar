import { MapPinned } from 'lucide-react';
import { useMemo, useState } from 'react';
import { gtfsNetwork } from '../data/gtfsNetwork';
import { useGtfsNetwork } from '../data/useGtfsNetwork';
import { LineBadge } from '../components/LineBadge';
import { SearchBox } from '../components/SearchBox';
import type { Stop } from '../types';

type Props = {
  onSelectStop: (stop: Stop) => void;
};

export function StopsScreen({ onSelectStop }: Props) {
  const { loaded, revision: gtfsRevision } = useGtfsNetwork();
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(120);
  const normalized = query.trim().toLowerCase();
  const stops = useMemo(
    () =>
      gtfsNetwork.stops
        .filter((stop) => !normalized || stop.name.toLowerCase().includes(normalized) || stop.code.includes(normalized)),
    [gtfsRevision, normalized],
  );
  const visibleStops = stops.slice(0, visibleCount);

  return (
    <main className="screen panel-screen">
      <section className="screen-header">
        <div>
          <span>Paline GTT</span>
          <h1>Fermate</h1>
        </div>
      </section>
      <SearchBox
        value={query}
        placeholder="Cerca fermata o palina"
        onChange={(value) => {
          setQuery(value);
          setVisibleCount(120);
        }}
      />
      <section className="list-section">
        <div className="list-result-count">
          {loaded ? `${stops.length} fermate trovate · mostrate ${visibleStops.length}` : 'Caricamento paline GTT…'}
        </div>
        {visibleStops.map((stop) => (
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
        {visibleStops.length < stops.length && (
          <button
            className="load-more-button"
            type="button"
            onClick={() => setVisibleCount((count) => Math.min(count + 120, stops.length))}
          >
            Mostra altre fermate
          </button>
        )}
      </section>
    </main>
  );
}
