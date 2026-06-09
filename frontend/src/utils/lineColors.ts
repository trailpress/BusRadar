import { lines } from '../data/demoData';

export function getLineColor(lineId: string) {
  return lines.find((line) => line.id === lineId)?.color ?? '#2F7DFF';
}
