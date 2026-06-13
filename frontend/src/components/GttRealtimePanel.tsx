import { RefreshCw, Radio, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GTT_REALTIME_API_BASE } from '../services/gttRealtime';

type FeedSummary = {
  kind: string;
  status: string;
  entityCount?: number;
  vehiclePositionCount?: number;
  tripUpdateCount?: number;
  alertCount?: number;
  firstVehicles?: Array<{
    routeId: string | null;
    vehicleId: string | null;
    tripId: string | null;
    lat: number | null;
    lon: number | null;
    timestamp: string | null;
  }>;
};

type ProxyPayload = {
  status: string;
  feeds?: {
    vehicles: FeedSummary;
    trips: FeedSummary;
    alerts: FeedSummary;
  };
  error?: string;
};

function statusText(feed?: FeedSummary) {
  if (!feed) return 'Non disponibile';
  if (feed.status !== 'ok') return feed.status;
  return `${feed.entityCount ?? 0} entita`;
}

function formatCoord(value: number | null) {
  return typeof value === 'number' ? value.toFixed(5) : '-';
}

export function GttRealtimePanel() {
  const [payload, setPayload] = useState<ProxyPayload>();
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch(`${GTT_REALTIME_API_BASE}/all`);
      setPayload((await response.json()) as ProxyPayload);
    } catch (error) {
      setPayload({ status: 'proxy-error', error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 15000);
    return () => window.clearInterval(id);
  }, []);

  const vehicles = payload?.feeds?.vehicles.firstVehicles ?? [];

  return (
    <section className="realtime-card">
      <div className="realtime-card-top">
        <div className="row-icon">
          <Radio size={20} />
        </div>
        <div>
          <strong>GTT realtime</strong>
          <span>Proxy pubblico: Vehicle Positions, Trip Updates, Alerts</span>
        </div>
        <button className="icon-action" type="button" onClick={refresh} disabled={loading} aria-label="Aggiorna GTT realtime">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="feed-grid">
        <div className={`feed-pill feed-pill--${payload?.feeds?.vehicles.status === 'ok' ? 'ok' : 'warn'}`}>
          <span>Vehicle Positions</span>
          <strong>{statusText(payload?.feeds?.vehicles)}</strong>
          <small>{payload?.feeds?.vehicles.vehiclePositionCount ?? 0} mezzi</small>
        </div>
        <div className={`feed-pill feed-pill--${payload?.feeds?.trips.status === 'ok' ? 'ok' : 'warn'}`}>
          <span>Trip Updates</span>
          <strong>{statusText(payload?.feeds?.trips)}</strong>
          <small>{payload?.feeds?.trips.tripUpdateCount ?? 0} update</small>
        </div>
        <div className={`feed-pill feed-pill--${payload?.feeds?.alerts.status === 'ok' ? 'ok' : 'warn'}`}>
          <span>Alerts</span>
          <strong>{statusText(payload?.feeds?.alerts)}</strong>
          <small>{payload?.feeds?.alerts.alertCount ?? 0} alert</small>
        </div>
      </div>

      {payload?.error && (
        <div className="realtime-empty">
          <ShieldAlert size={18} />
          <span>{payload.error}</span>
        </div>
      )}

      {vehicles.length > 0 ? (
        <div className="realtime-table">
          {vehicles.map((vehicle, index) => (
            <div key={`${vehicle.vehicleId}-${index}`} className="realtime-row">
              <strong>{vehicle.routeId ?? '-'}</strong>
              <span>Vettura {vehicle.vehicleId ?? '-'}</span>
              <small>Trip {vehicle.tripId || '-'}</small>
              <small>{formatCoord(vehicle.lat)}, {formatCoord(vehicle.lon)}</small>
              <small>{vehicle.timestamp ?? '-'}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="realtime-empty">
          <ShieldAlert size={18} />
          <span>Proxy realtime non disponibile. La mappa resta in fallback simulato.</span>
        </div>
      )}
    </section>
  );
}
