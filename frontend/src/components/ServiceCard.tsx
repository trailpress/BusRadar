import { Clock3, Radio } from 'lucide-react';
import type { Vehicle } from '../types';
import { pluralizeBus } from '../utils/format';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
};

export function ServiceCard({ vehicles, selectedLine }: Props) {
  const count = selectedLine ? vehicles.filter((vehicle) => vehicle.line === selectedLine).length : vehicles.length;
  const averageSpeed = Math.round(vehicles.reduce((sum, vehicle) => sum + vehicle.speed, 0) / Math.max(vehicles.length, 1));
  const lastUpdate = vehicles[0]?.updatedAt ?? '--:--';

  return (
    <aside className="service-card">
      <div>
        <Radio size={14} />
        <strong>{pluralizeBus(count)} in servizio</strong>
      </div>
      <footer>
        <span>Ultimo aggiornamento: {lastUpdate}</span>
        <span>
          <Clock3 size={13} />
          {averageSpeed} km/h
        </span>
      </footer>
    </aside>
  );
}
