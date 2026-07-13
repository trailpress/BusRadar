import { RefreshCw, Radio, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchRealtimeFeeds, getRealtimeConfigSummary, type RealtimeFeedResult } from '../services/realtimeFeed';

const statusLabel: Record<RealtimeFeedResult['status'], string> = {
  'missing-config': 'Non configurato',
  loading: 'Caricamento',
  ok: 'OK',
  'http-error': 'Errore HTTP',
  'network-error': 'Errore rete/CORS',
  'protobuf-error': 'Errore protobuf',
  'empty-feed': 'Feed vuoto',
};

function formatCoord(value: number | null) {
  return typeof value === 'number' ? value.toFixed(5) : '-';
}

export function RealtimePanel() {
  const config = getRealtimeConfigSummary();
  const [feeds, setFeeds] = useState<RealtimeFeedResult[]>(() =>
    config.map((feed) => ({
      kind: feed.kind,
      label: feed.label,
      status: feed.configured ? 'loading' : 'missing-config',
    })),
  );
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setFeeds((current) => current.map((feed) => (feed.status === 'missing-config' ? feed : { ...feed, status: 'loading' })));
    try {
      setFeeds(await fetchRealtimeFeeds());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const vehicles = feeds.find((feed) => feed.kind === 'vehiclePositions')?.firstVehicles ?? [];

  return (
    <section className="realtime-card">
      <div className="realtime-card-top">
        <div className="row-icon">
          <Radio size={20} />
        </div>
        <div>
          <strong>Realtime GTFS-RT</strong>
          <span>Solo feed configurati via env. SimulationAdapter resta attivo.</span>
        </div>
        <button className="icon-action" type="button" onClick={refresh} disabled={loading} aria-label="Aggiorna realtime">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="feed-grid">
        {feeds.map((feed) => (
          <div key={feed.kind} className={`feed-pill feed-pill--${feed.status === 'ok' ? 'ok' : feed.status === 'missing-config' ? 'muted' : 'warn'}`}>
            <span>{feed.label}</span>
            <strong>{statusLabel[feed.status]}</strong>
            {typeof feed.entityCount === 'number' && <small>{feed.entityCount} entita</small>}
            {feed.error && <small>{feed.error}</small>}
          </div>
        ))}
      </div>

      {vehicles.length > 0 ? (
        <div className="realtime-table">
          {vehicles.map((vehicle, index) => (
            <div key={`${vehicle.vehicleId}-${vehicle.tripId}-${index}`} className="realtime-row">
              <strong>{vehicle.routeId ?? '-'}</strong>
              <span>Vettura {vehicle.vehicleId ?? '-'}</span>
              <small>Trip {vehicle.tripId ?? '-'}</small>
              <small>{formatCoord(vehicle.lat)}, {formatCoord(vehicle.lon)}</small>
              <small>{vehicle.timestamp ?? '-'}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="realtime-empty">
          <ShieldAlert size={18} />
          <span>Per vedere mezzi reali serve un feed GTFS-RT Vehicle Positions autorizzato e compatibile CORS configurato in build.</span>
        </div>
      )}
    </section>
  );
}
