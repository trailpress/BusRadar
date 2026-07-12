import { ArrowLeft, BusFront, Clock3, MapPinned, Route as RouteIcon, Star, Timer, TramFront } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BusMap } from '../components/BusMap';
import { LineBadge } from '../components/LineBadge';
import { RouteDirectionSelector } from '../components/RouteDirectionSelector';
import { RouteStreetViewPlayer } from '../components/RouteStreetViewPlayer';
import { getCanonicalGtfsRoutesForLine, getGtfsRouteDirectionKey, getGtfsRouteVariant, getGtfsRoutesForLine, getGtfsStopsForRoute, gtfsNetwork, type GtfsStop } from '../data/gtfsNetwork';
import { useGtfsNetwork } from '../data/useGtfsNetwork';
import { fetchGttStopArrivalsInfo } from '../services/gttRealtime';
import type { LatLng, TransitLine, Vehicle } from '../types';
import { isLineFavorite, setLineFavorite } from '../utils/lineFavorites';
import { notify } from '../utils/notify';
import { routeProgressAtPoint } from '../utils/geo';
import { vehicleIdentifierLabel } from '../utils/vehicleIdentity';

type Props = {
  line: TransitLine;
  vehicles: Vehicle[];
  userLocation: LatLng;
  onBack: () => void;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onSelectStop: (stop: GtfsStop) => void;
};

type PlannedLinePassage = {
  id: string;
  stop: GtfsStop;
  line: string;
  timeLabel: string;
  minutes: number;
  source: 'realtime' | 'scheduled';
};

export function LineDetailScreen({ line, vehicles, userLocation, onBack, onSelectVehicle, onSelectStop }: Props) {
  const { revision: gtfsRevision } = useGtfsNetwork();
  const [tab, setTab] = useState<'details' | 'route' | 'street' | 'stops'>('route');
  const [favorite, setFavorite] = useState(() => isLineFavorite(line.id, Boolean(line.favorite)));
  const [plannedPassages, setPlannedPassages] = useState<PlannedLinePassage[]>([]);
  const [plannedPassagesLoading, setPlannedPassagesLoading] = useState(false);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string>();
  const routeVariants = useMemo(() => getGtfsRoutesForLine(line.id), [gtfsRevision, line.id]);
  const canonicalRoutes = useMemo(() => getCanonicalGtfsRoutesForLine(line.id), [gtfsRevision, line.id]);
  const streetViewRoute = useMemo(() => {
    if (canonicalRoutes.length === 0) return undefined;
    if (!selectedRouteKey) return canonicalRoutes[0];
    return canonicalRoutes.find((route) => getGtfsRouteDirectionKey(route) === selectedRouteKey) ?? canonicalRoutes[0];
  }, [canonicalRoutes, selectedRouteKey]);
  const lineStops = useMemo(() => {
    const routeStops = routeVariants.flatMap(getGtfsStopsForRoute);
    const fallbackStops = gtfsNetwork.stops.filter((stop) => stop.lines.includes(line.id));
    return (routeStops.length > 0 ? routeStops : fallbackStops)
      .filter((stop, index, list) => list.findIndex((item) => item.id === stop.id) === index);
  }, [gtfsRevision, line.id, routeVariants]);
  const liveVehicles = vehicles
    .filter((vehicle) => vehicle.line === line.id || getGtfsRouteVariant(vehicle.routeVariantId)?.line === line.id)
    .filter((vehicle) => {
      if (!selectedRouteKey) return true;
      const routeVariant = getGtfsRouteVariant(vehicle.routeVariantId);
      if (routeVariant) return getGtfsRouteDirectionKey(routeVariant) === selectedRouteKey;
      return canonicalRoutes.some((route) => (
        getGtfsRouteDirectionKey(route) === selectedRouteKey
        && (routeProgressAtPoint(route.path, vehicle)?.distanceMeters ?? Number.POSITIVE_INFINITY) <= 120
      ));
    })
    .sort((a, b) => (a.etaTerminalMinutes ?? 999) - (b.etaTerminalMinutes ?? 999));
  const routeIds = useMemo(
    () => [...new Set(routeVariants.flatMap((route) => [route.routeId, route.line]).filter(Boolean))],
    [routeVariants],
  );
  const stopSequencesByRoute = useMemo(() => {
    const sequences: Record<string, number[]> = {};
    routeVariants.forEach((route) => {
      const routeSequences = route.stopEntries.map((entry) => entry.sequence);
      sequences[route.routeId] = routeSequences;
      sequences[route.line] = [...(sequences[route.line] ?? []), ...routeSequences];
    });
    return sequences;
  }, [routeVariants]);

  const trackingText = (vehicle: Vehicle) => {
    if (vehicle.routeMatchStatus === 'on-route') return 'su percorso';
    if (vehicle.routeMatchStatus === 'gps-only') return 'GPS reale';
    return 'solo feed';
  };

  useEffect(() => {
    let cancelled = false;

    if (tab !== 'route' || liveVehicles.length > 0 || lineStops.length === 0) {
      setPlannedPassages([]);
      setPlannedPassagesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const sampledStops = lineStops
      .filter((stop, index, stops) => {
        if (stops.length <= 8) return true;
        const step = Math.max(1, Math.floor(stops.length / 6));
        return index === 0 || index === stops.length - 1 || index % step === 0;
      })
      .slice(0, 8);

    setPlannedPassagesLoading(true);
    Promise.allSettled(
      sampledStops.map((stop) =>
        fetchGttStopArrivalsInfo(stop.id, routeIds, stopSequencesByRoute)
          .then((result) => ({ stop, arrivals: result.arrivals })),
      ),
    )
      .then((results) => {
        if (cancelled) return;

        const nextPassages = results
          .flatMap((result) => {
            if (result.status !== 'fulfilled') return [];
            return result.value.arrivals
              .filter((arrival) => arrival.line === line.id)
              .map((arrival) => ({
                id: `${result.value.stop.id}-${arrival.tripId}-${arrival.timeLabel}-${arrival.source}`,
                stop: result.value.stop,
                line: arrival.line,
                timeLabel: arrival.timeLabel,
                minutes: arrival.minutes,
                source: arrival.source,
              }));
          })
          .sort((a, b) => a.minutes - b.minutes)
          .filter((passage, index, list) => list.findIndex((item) => item.id === passage.id) === index)
          .slice(0, 8);

        setPlannedPassages(nextPassages);
      })
      .finally(() => {
        if (!cancelled) setPlannedPassagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [line.id, lineStops, liveVehicles.length, routeIds, stopSequencesByRoute, tab]);

  useEffect(() => {
    if (tab !== 'street' || selectedRouteKey || canonicalRoutes.length === 0) return;
    setSelectedRouteKey(getGtfsRouteDirectionKey(canonicalRoutes[0]));
  }, [canonicalRoutes, selectedRouteKey, tab]);

  const toggleFavorite = () => {
    const nextFavorite = !favorite;
    setLineFavorite(line.id, nextFavorite);
    setFavorite(nextFavorite);
    notify(`Linea ${line.id} ${nextFavorite ? 'aggiunta ai' : 'rimossa dai'} preferiti`);
  };

  return (
    <main className="screen line-detail">
      <section className="line-detail-top">
        <button className="back-button" type="button" onClick={onBack} aria-label="Torna indietro">
          <ArrowLeft size={20} />
        </button>
        <strong>Linea {line.id}</strong>
        <button className={`back-button${favorite ? ' is-active' : ''}`} type="button" aria-label={favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'} aria-pressed={favorite} onClick={toggleFavorite}>
          <Star size={19} className={favorite ? 'star-on' : ''} />
        </button>
      </section>

      <div className="segmented-tabs" role="tablist" aria-label={`Informazioni linea ${line.id}`}>
        <button className={tab === 'details' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Dettagli</button>
        <button className={tab === 'route' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'route'} onClick={() => setTab('route')}>Percorso</button>
        <button className={tab === 'street' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'street'} onClick={() => setTab('street')}>Vista strada</button>
        <button className={tab === 'stops' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'stops'} onClick={() => setTab('stops')}>Fermate</button>
      </div>

      {tab === 'details' && (
        <>
          <section className="line-summary">
            <LineBadge line={line.id} size="lg" />
            <div>
              <strong>{line.name}</strong>
              <span>{line.direction} ↔ {line.alternateDirection}</span>
            </div>
          </section>
          <section className="line-detail-facts">
            <div><BusFront size={18} /><strong>{liveVehicles.length}</strong><span>Mezzi realtime</span></div>
            <div><RouteIcon size={18} /><strong>{routeVariants.length}</strong><span>Varianti GTFS</span></div>
            <div><MapPinned size={18} /><strong>{lineStops.length}</strong><span>Paline servite</span></div>
          </section>
          <section className="stats-grid">
            <div><RouteIcon size={18} /><strong>{line.stats.lengthKm} km</strong><span>Lunghezza</span></div>
            <div><Timer size={18} /><strong>{line.stats.durationMin || '—'} min</strong><span>Tempo programmato</span></div>
            <div><TramFront size={18} /><strong>{line.stats.tripsToday}</strong><span>Corse programmate</span></div>
            <div><Clock3 size={18} /><strong>{line.stats.firstRun} / {line.stats.lastRun}</strong><span>Primo / Ultimo</span></div>
          </section>
        </>
      )}

      {tab === 'route' && (
        <>
          <RouteDirectionSelector routes={canonicalRoutes} selectedRouteKey={selectedRouteKey} onChange={setSelectedRouteKey} />
          <section className="line-map-panel">
            <BusMap vehicles={vehicles} selectedLine={line.id} showRouteForLine={line.id} selectedRouteKey={selectedRouteKey} userLocation={userLocation} onSelectVehicle={onSelectVehicle} />
          </section>
          <section className="list-section live-line-section">
            <div className="section-heading">
              <h2>Mezzi live GTT</h2>
              <span>{liveVehicles.length} live</span>
            </div>
            {liveVehicles.length > 0 ? liveVehicles.map((vehicle) => (
              <button className="line-live-vehicle" key={vehicle.vehicleId} type="button" onClick={() => onSelectVehicle(vehicle)}>
                <LineBadge line={vehicle.line} />
                <div>
                  <strong>{vehicleIdentifierLabel(vehicle)}</strong>
                  <span>{vehicle.terminalName ?? vehicle.direction}</span>
                </div>
                <em>{vehicle.speed} km/h</em>
                <small>{trackingText(vehicle)}</small>
              </button>
            )) : (
              <>
                <div className="line-live-empty">
                  <strong>Nessun mezzo pubblicato ora dal feed GTFS-RT</strong>
                  <span>{plannedPassages.length > 0 ? 'Mostro i prossimi passaggi programmati dal GTFS statico GTT.' : 'Il percorso e le fermate restano disponibili dal GTFS statico GTT.'}</span>
                </div>
                <div className="line-scheduled-passages" aria-live="polite">
                  <div className="section-heading compact-heading">
                    <h2>Orari programmati</h2>
                    <span>{plannedPassagesLoading ? 'carico...' : `${plannedPassages.length} passaggi`}</span>
                  </div>
                  {plannedPassages.map((passage) => (
                    <button className="line-scheduled-passage" key={passage.id} type="button" onClick={() => onSelectStop(passage.stop)}>
                      <LineBadge line={passage.line} />
                      <div>
                        <strong>{passage.stop.name}</strong>
                        <span>Palina {passage.stop.code}</span>
                      </div>
                      <em>{passage.timeLabel}</em>
                      <small>{passage.source === 'scheduled' ? 'prog.' : passage.minutes === 0 ? 'ora' : `${passage.minutes} min`}</small>
                    </button>
                  ))}
                  {!plannedPassagesLoading && plannedPassages.length === 0 && (
                    <div className="line-live-empty is-quiet">
                      <span>Nessun passaggio programmato trovato nelle prossime ore per il calendario GTFS caricato.</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {tab === 'street' && (
        <>
          <RouteDirectionSelector routes={canonicalRoutes} selectedRouteKey={selectedRouteKey} onChange={setSelectedRouteKey} allowAll={false} />
          <RouteStreetViewPlayer route={streetViewRoute} />
        </>
      )}

      {tab === 'stops' && (
        <section className="list-section line-stops-section">
          <div className="section-heading"><h2>{lineStops.length} fermate</h2><span>Tocca una palina per i passaggi</span></div>
          {lineStops.map((stop) => (
            <button className="stop-row" type="button" key={stop.id} onClick={() => onSelectStop(stop)}>
              <MapPinned size={17} />
              <div>
                <strong>{stop.name}</strong>
                <span>Palina {stop.code}</span>
              </div>
              <small>{stop.lines.slice(0, 3).join(' · ')}</small>
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
