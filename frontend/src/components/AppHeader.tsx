import { Activity, Radar, Search } from 'lucide-react';

type Props = {
  search: string;
  onSearch: (value: string) => void;
  onRadar: () => void;
};

export function AppHeader({ search, onSearch, onRadar }: Props) {
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
      <label className="map-search" aria-label="Cerca linea o vettura">
        <Search size={18} />
        <input value={search} placeholder="Cerca" onChange={(event) => onSearch(event.target.value)} />
      </label>
    </header>
  );
}
