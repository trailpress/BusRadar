import { Radio } from 'lucide-react';
import type { Vehicle } from '../types';
import { pluralizeBus } from '../utils/format';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
};

export function ServiceCard({ vehicles, selectedLine }: Props) {
  const count = selectedLine ? vehicles.filter((vehicle) => vehicle.line === selectedLine).length : vehicles.length;
  const lastUpdate = vehicles[0]?.updatedAt ?? '--:--';

  return (
    <aside className="service-card">
      <div>
        <Radio size={13} />
        <strong>{pluralizeBus(count)}</strong>
      </div>
      <span>Agg. {lastUpdate}</span>
    </aside>
  );
}
