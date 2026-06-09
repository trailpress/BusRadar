import { ChevronRight, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { lines } from '../data/demoData';
import type { TransitLine, Vehicle } from '../types';
import { LineBadge } from '../components/LineBadge';
import { SearchBox } from '../components/SearchBox';
import { notify } from '../utils/notify';

type Props = {
  vehicles: Vehicle[];
  onSelectLine: (line: TransitLine) => void;
};

export function LinesScreen({ vehicles, onSelectLine }: Props) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () => lines.filter((line) => line.id.includes(normalized) || line.name.toLowerCase().includes(normalized) || line.direction.toLowerCase().includes(normalized)),
    [normalized],
  );
  const favorites = filtered.filter((line) => line.favorite);
  const others = filtered.filter((line) => !line.favorite);

  const renderLine = (line: TransitLine) => (
    <button key={line.id} className="line-row" type="button" onClick={() => onSelectLine(line)}>
      <LineBadge line={line.id} size="lg" />
      <div>
        <strong>{line.name}</strong>
        <span>{vehicles.filter((vehicle) => vehicle.line === line.id).length * 7 + 6} mezzi in servizio</span>
      </div>
      <div className="row-meta">
        {line.favorite ? <Star size={17} className="star-on" /> : <ChevronRight size={18} />}
      </div>
    </button>
  );

  return (
    <main className="screen panel-screen">
      <section className="screen-header">
        <div>
          <h1>Linee</h1>
        </div>
      </section>
      <SearchBox value={query} placeholder="Cerca linea" onChange={setQuery} />
      {favorites.length > 0 && (
        <section className="list-section">
          <div className="section-heading"><h2>Preferite</h2><button type="button" onClick={() => notify('Modifica preferite: funzione demo')}>Modifica</button></div>
          {favorites.map(renderLine)}
        </section>
      )}
      <section className="list-section">
        <h2>Tutte le linee</h2>
        {others.map(renderLine)}
      </section>
    </main>
  );
}
