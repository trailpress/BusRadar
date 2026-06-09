import { BusFront, CircleDot, Map, Menu, RadioTower } from 'lucide-react';
import type { ElementType } from 'react';
import type { TabKey } from '../types';

const tabs: Array<{ key: TabKey; label: string; icon: ElementType }> = [
  { key: 'map', label: 'Mappa', icon: Map },
  { key: 'lines', label: 'Linee', icon: RadioTower },
  { key: 'stops', label: 'Fermate', icon: CircleDot },
  { key: 'vehicles', label: 'Vetture', icon: BusFront },
  { key: 'more', label: 'Altro', icon: Menu },
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
