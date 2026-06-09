export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function nowTime() {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

export function pluralizeBus(count: number) {
  return count === 1 ? '1 mezzo' : `${count} mezzi`;
}
