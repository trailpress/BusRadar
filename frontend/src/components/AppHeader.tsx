import { Activity, LoaderCircle, Radar, Search } from 'lucide-react';

type Props = {
  search: string;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
  searchLoading?: boolean;
  onRadar: () => void;
};

export function AppHeader({ search, onSearch, onSearchSubmit, searchLoading, onRadar }: Props) {
  return (
    <header className="app-header">
      <div className="brand-row">
        <div className="brand-mark">
          <Radar size={19} />
        </div>
        <div>
          <strong>BusRadar</strong>
          <span>Torino · v0.2.1</span>
        </div>
        <button className="live-pill" type="button" onClick={onRadar}>
          <Activity size={14} />
          Live
        </button>
      </div>
      <form
        className="map-search"
        role="search"
        aria-label="Cerca via, luogo, linea o vettura"
        onSubmit={(event) => {
          event.preventDefault();
          onSearchSubmit();
        }}
      >
        <button type="submit" aria-label="Avvia ricerca" disabled={searchLoading}>
          {searchLoading ? <LoaderCircle className="is-spinning" size={18} /> : <Search size={18} />}
        </button>
        <input
          value={search}
          enterKeyHint="search"
          placeholder="Via, luogo, linea o vettura"
          onChange={(event) => onSearch(event.target.value)}
        />
      </form>
    </header>
  );
}
