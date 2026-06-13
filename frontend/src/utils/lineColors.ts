import { gtfsNetwork } from '../data/gtfsNetwork';
import { lines } from '../data/demoData';

export function getLineColor(lineId: string) {
  return gtfsNetwork.lines.find((line) => line.id === lineId)?.color ?? lines.find((line) => line.id === lineId)?.color ?? '#2F7DFF';
}
