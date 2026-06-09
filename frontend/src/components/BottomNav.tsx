import { BusFront, CircleDot, Map, Radar, Route } from 'lucide-react';
import type { ElementType } from 'react';
import type { TabKey } from '../types';

const tabs: Array<{ key: TabKey; label: string; icon: ElementType }> = [
  { key: 'map', label: 'Mappa', icon: Map },
  { key: 'lines', label: 'Linee', icon: Route },
  { key: 'stops', label: 'Fermate', icon: CircleDot },
  { key: 'vehicles', label: 'Vetture', icon: BusFront },
  { key: 'more', label: 'Radar', icon: Radar },
];

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button key={key} className={active === key ? 'is-active' : ''} type="button" onClick={() => onChange(key)}>
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
