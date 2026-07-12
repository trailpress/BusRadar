import { ChevronRight, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { gtfsNetwork, type GtfsLine } from '../data/gtfsNetwork';
import { useGtfsNetwork } from '../data/useGtfsNetwork';
import type { Vehicle } from '../types';
import { LineBadge } from '../components/LineBadge';
import { SearchBox } from '../components/SearchBox';
import { isLineFavorite, setLineFavorite } from '../utils/lineFavorites';

type Props = {
  vehicles: Vehicle[];
  onSelectLine: (line: GtfsLine) => void;
};

function normalizeLineSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/barrat[oa]/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ');
}

export function LinesScreen({ vehicles, onSelectLine }: Props) {
  const { loaded, revision: gtfsRevision } = useGtfsNetwork();
  const [query, setQuery] = useState('');
  const [editingFavorites, setEditingFavorites] = useState(false);
  const [, setFavoriteRevision] = useState(0);
  const normalized = normalizeLineSearch(query);
  const filtered = useMemo(
    () => gtfsNetwork.lines.filter((line) => (
      normalizeLineSearch(line.id).includes(normalized)
      || normalizeLineSearch(line.name).includes(normalized)
      || normalizeLineSearch(line.direction).includes(normalized)
    )),
    [gtfsRevision, normalized],
  );
  const favorites = filtered.filter((line) => isLineFavorite(line.id, Boolean(line.favorite)));
  const others = filtered.filter((line) => !isLineFavorite(line.id, Boolean(line.favorite)));

  const renderLine = (line: GtfsLine) => {
    const favorite = isLineFavorite(line.id, Boolean(line.favorite));
    const realtimeVehicles = vehicles.filter((vehicle) => vehicle.line === line.id).length;
    return (
    <button
      key={line.id}
      className={`line-row${editingFavorites ? ' is-editing' : ''}`}
      type="button"
      onClick={() => {
        if (!editingFavorites) {
          onSelectLine(line);
          return;
        }
        setLineFavorite(line.id, !favorite);
        setFavoriteRevision((revision) => revision + 1);
      }}
      aria-label={editingFavorites ? `${favorite ? 'Rimuovi' : 'Aggiungi'} linea ${line.id} dai preferiti` : `Apri linea ${line.id}`}
    >
      <LineBadge line={line.id} size="lg" />
      <div>
        <strong>{line.name}</strong>
        <span>
          {realtimeVehicles > 0
            ? `${realtimeVehicles} mezzi realtime`
            : `programmato GTFS · ${line.stats.tripsToday} corse`}
          {' · '}
          {line.vehicleType === 'tram' ? 'tram' : 'bus'}
        </span>
      </div>
      <div className="row-meta">
        {editingFavorites || favorite ? <Star size={17} className={favorite ? 'star-on' : ''} /> : <ChevronRight size={18} />}
      </div>
    </button>
    );
  };

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
          <div className="section-heading"><h2>Preferite</h2><button type="button" onClick={() => setEditingFavorites((value) => !value)}>{editingFavorites ? 'Fine' : 'Modifica'}</button></div>
          {favorites.map(renderLine)}
        </section>
      )}
      <section className="list-section">
        <div className="section-heading">
          <h2>Tutte le linee</h2>
          {favorites.length === 0 && <button type="button" onClick={() => setEditingFavorites((value) => !value)}>{editingFavorites ? 'Fine' : 'Modifica preferite'}</button>}
        </div>
        {others.map(renderLine)}
        {!loaded && <div className="list-result-count">Caricamento rete GTT…</div>}
      </section>
    </main>
  );
}
