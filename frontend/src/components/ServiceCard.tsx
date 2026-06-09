import { BusFront, Clock3, Radio } from 'lucide-react';
import type { Vehicle } from '../types';
import { pluralizeBus } from '../utils/format';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
};

export function ServiceCard({ vehicles, selectedLine }: Props) {
  const count = selectedLine ? vehicles.filter((vehicle) => vehicle.line === selectedLine).length : vehicles.length;
  const averageSpeed = Math.round(vehicles.reduce((sum, vehicle) => sum + vehicle.speed, 0) / Math.max(vehicles.length, 1));

  return (
    <aside className="service-card">
      <div>
        <Radio size={16} />
        <span>Demo live</span>
      </div>
      <strong>{pluralizeBus(count)} in servizio</strong>
      <footer>
        <span>
          <BusFront size={14} />
          {selectedLine ? `Linea ${selectedLine}` : 'Tutte le linee'}
        </span>
        <span>
          <Clock3 size={14} />
          media {averageSpeed} km/h
        </span>
      </footer>
    </aside>
  );
}
