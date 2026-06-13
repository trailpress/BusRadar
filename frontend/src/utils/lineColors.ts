import { gtfsNetwork } from '../data/gtfsNetwork';

export function getLineColor(lineId: string) {
  return gtfsNetwork.lines.find((line) => line.id === lineId)?.color ?? '#2F7DFF';
}
