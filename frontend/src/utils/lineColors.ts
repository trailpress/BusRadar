import { gtfsNetwork } from '../data/gtfsNetwork';
import { routeDisplayColor } from './routePalette';

export function getLineColor(lineId: string) {
  const line = gtfsNetwork.lines.find((item) => item.id === lineId || item.routeId === lineId);
  return routeDisplayColor(line?.id ?? lineId, line?.vehicleType);
}
