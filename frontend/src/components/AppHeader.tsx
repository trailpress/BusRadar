import { Activity, Radar } from 'lucide-react';
import { SearchBox } from './SearchBox';

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
          <span>Torino</span>
        </div>
        <button className="live-pill" type="button" onClick={onRadar}>
          <Activity size={14} />
          Live
        </button>
      </div>
      <SearchBox value={search} placeholder="Cerca linea o vettura" onChange={onSearch} />
    </header>
  );
}
