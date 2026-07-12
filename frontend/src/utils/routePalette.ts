const ROUTE_COLORS = [
  '#006BB6',
  '#00AEEF',
  '#009B3A',
  '#CE1126',
  '#FCCC0A',
  '#B933AD',
  '#FF6319',
  '#6CBE45',
  '#A7A9AC',
  '#8E258D',
  '#00A88F',
  '#EE352E',
  '#2850AD',
  '#996633',
  '#2E7D32',
  '#D81B60',
  '#00838F',
  '#5E35B1',
];

const TRAM_COLORS = ['#009BDE', '#006BB6', '#00A88F', '#6CBE45', '#8E258D'];

export function hashRouteId(routeId: string) {
  return [...routeId.toUpperCase()].reduce((hash, char) => {
    const code = char.charCodeAt(0);
    return ((hash << 5) - hash + code) | 0;
  }, 0);
}

export function normalizeRouteId(routeId: string) {
  return routeId.replace(/^gtt-/i, '').replace(/U$/i, '');
}

export function routeDisplayColor(routeId: string, vehicleType?: 'bus' | 'tram') {
  const normalized = normalizeRouteId(routeId);
  const palette = vehicleType === 'tram' ? TRAM_COLORS : ROUTE_COLORS;
  const index = Math.abs(hashRouteId(normalized)) % palette.length;
  return palette[index];
}

export function routeDisplayTextColor(routeId: string, vehicleType?: 'bus' | 'tram') {
  const color = routeDisplayColor(routeId, vehicleType).replace('#', '');
  const r = Number.parseInt(color.slice(0, 2), 16);
  const g = Number.parseInt(color.slice(2, 4), 16);
  const b = Number.parseInt(color.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170 ? '#0f172a' : '#ffffff';
}

export function routeLineOffset(routeId: string, directionId?: string) {
  const base = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5][Math.abs(hashRouteId(normalizeRouteId(routeId))) % 6];
  const directionNudge = directionId === '1' ? 1.4 : directionId === '0' ? -1.4 : 0;
  return base + directionNudge;
}

const DIRECTION_COLORS = [
  '#2F7DFF', '#F59E0B', '#10B981', '#E85D75',
  '#8B5CF6', '#06B6D4', '#EF4444', '#84CC16',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1',
  '#22C55E', '#D946EF', '#0EA5E9', '#EAB308',
];

export function routeDirectionColor(directionIndex: number) {
  return DIRECTION_COLORS[Math.max(0, directionIndex) % DIRECTION_COLORS.length];
}
