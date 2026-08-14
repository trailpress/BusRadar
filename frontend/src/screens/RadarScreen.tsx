import { ArrowLeft, BusFront, Crosshair, Info, MapPinned, Navigation, TrainFront } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, Stop } from '../types';
import type { Vehicle } from '../types';
import { gtfsNetwork } from '../data/gtfsNetwork';
import { useGtfsNetwork } from '../data/useGtfsNetwork';
import { bearingDegrees, distanceMeters } from '../utils/geo';
import { formatDistance } from '../utils/format';
import { LineBadge } from '../components/LineBadge';
import { notify } from '../utils/notify';
import { vehicleIdentifierLabel } from '../utils/vehicleIdentity';
import { FeedDelayTuning } from '../components/FeedDelayTuning';

const radiusOptions = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
];

type Props = {
  vehicles: Vehicle[];
  userLocation: LatLng;
  hasUserLocation: boolean;
  onLocateUser: () => Promise<LatLng | undefined>;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onSelectStop: (stop: Stop) => void;
  onBack: () => void;
};

// Quante righe si mostrano prima di chiedere «vedi tutte». Il radar prometteva
// «6 mezzi nel raggio» e ne elencava 4: chi contava le righe concludeva che non
// pescasse niente.
const FIRST_PAGE = 8;

// «1 mezzi nel raggio» si legge come un errore dell'app, e chi lo legge smette
// di fidarsi anche del numero.
function plural(count: number, singular: string, plural_: string) {
  return `${count} ${count === 1 ? singular : plural_}`;
}

// La taratura del ritardo del feed vive qui perche' e' l'unica schermata
// dell'app che non sia mappa o elenco.
export function RadarScreen({ vehicles, userLocation, hasUserLocation, onLocateUser, onSelectVehicle, onSelectStop, onBack }: Props) {
  const { revision: gtfsRevision } = useGtfsNetwork();
  const [radius, setRadius] = useState(1000);
  const [locating, setLocating] = useState(false);
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const [showAllStops, setShowAllStops] = useState(false);
  const askedForLocation = useRef(false);

  // **Il radar si apriva centrato su Torino, non su chi lo apre.** Con il
  // centro a Porta Nuova, da Falchera o da Mirafiori mostrava mezzi a chilometri
  // di distanza, e la schermata sembrava non pescare niente. Se il permesso e'
  // gia' stato dato, la posizione si chiede da soli all'apertura: chiederla di
  // nuovo con un tocco era un passaggio che nessuno indovinava.
  //
  // Se il permesso non c'e', **non** si apre il prompt a tradimento: resta il
  // pulsante, che dice a chiare lettere su cosa e' centrato il radar.
  useEffect(() => {
    if (hasUserLocation || askedForLocation.current) return;
    askedForLocation.current = true;
    const permissions = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!permissions?.query) return;
    let cancelled = false;
    void permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== 'granted') return;
        setLocating(true);
        void onLocateUser().finally(() => setLocating(false));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hasUserLocation, onLocateUser]);
  const matches = useMemo(
    () =>
      vehicles
        .map((vehicle) => ({ vehicle, distance: distanceMeters(userLocation, vehicle) }))
        .filter((item) => item.distance <= radius)
        .sort((a, b) => a.distance - b.distance),
    [vehicles, userLocation, radius],
  );
  // Le fermate intorno erano semplicemente assenti: il radar guardava solo i
  // mezzi, e in una via dove non passa niente restava vuoto anche con tre
  // paline a cinquanta metri.
  const nearbyStops = useMemo(
    () =>
      gtfsNetwork.stops
        .map((stop) => ({ stop, distance: distanceMeters(userLocation, stop) }))
        .filter((item) => item.distance <= radius)
        .sort((a, b) => a.distance - b.distance),
    [gtfsRevision, userLocation, radius],
  );
  // Una corsa non accertata non e' un mezzo osservato, e il riepilogo non puo'
  // contarla come tale: qui si dichiarano separate.
  const trackedCount = matches.filter(({ vehicle }) => vehicle.source !== 'scheduled').length;

  return (
    <main className="screen panel-screen">
      <section className="screen-header">
        <button className="plain-icon" type="button" aria-label="Indietro" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>Radar</h1>
        </div>
        <button className="plain-icon" type="button" aria-label="Informazioni" onClick={() => notify('Radar basato sui mezzi realtime disponibili')}>
          <Info size={18} />
        </button>
      </section>

      <section className="radar-panel">
        <button
          className="radar-location"
          type="button"
          disabled={locating}
          onClick={() => {
            setLocating(true);
            void onLocateUser().finally(() => setLocating(false));
          }}
        >
          <Navigation size={14} />
          {locating ? 'Localizzazione in corso' : hasUserLocation ? 'Centro: la mia posizione' : 'Centro: Torino · usa la mia posizione'}
        </button>
        <div className="radar-scope">
          <div className="radar-ring ring-1" />
          <div className="radar-ring ring-2" />
          <div className="radar-ring ring-3" />
          <div className="radar-sweep" />
          <div className="radar-center">
            <Crosshair size={18} />
          </div>
          {matches.slice(0, 10).map(({ vehicle, distance }, index) => {
            const angle = bearingDegrees(userLocation, vehicle);
            const normalized = Math.min(distance / radius, 1);
            const distancePx = 26 + normalized * 104;
            return (
              <button
                key={vehicle.vehicleId}
                className="radar-dot"
                style={{
                  '--angle': `${angle}deg`,
                  '--distance': `${distancePx}px`,
                  zIndex: 20 - index,
                } as CSSProperties}
                type="button"
                onClick={() => onSelectVehicle(vehicle)}
                aria-label={`Apri vettura ${vehicle.vehicleId}`}
              >
                {vehicle.vehicleType === 'tram' ? 'T' : vehicle.line}
              </button>
            );
          })}
        </div>
        <div className="radius-tabs">
          {radiusOptions.map((option) => (
            <button key={option.value} className={radius === option.value ? 'is-active' : ''} type="button" onClick={() => setRadius(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="list-section">
        <button
          className="radar-summary"
          type="button"
          onClick={() => notify(
            trackedCount === matches.length
              ? `${plural(matches.length, 'mezzo tracciato', 'mezzi tracciati')} nel raggio selezionato`
              : `${trackedCount} mezzi tracciati e ${matches.length - trackedCount} corse non accertate nel raggio selezionato`,
          )}
        >
          <span>
            <i /> {plural(matches.length, 'mezzo', 'mezzi')} nel raggio di {radiusOptions.find((option) => option.value === radius)?.label}
          </span>
          <small>
            {matches.length === 0
              ? hasUserLocation ? 'Nessuno qui intorno' : 'Radar centrato su Torino'
              : trackedCount === matches.length
                ? 'Tutti tracciati dal feed'
                : `${trackedCount} tracciati · ${matches.length - trackedCount} da orario`}
          </small>
        </button>
        {(showAllVehicles ? matches : matches.slice(0, FIRST_PAGE)).map(({ vehicle, distance }) => (
          <button className="vehicle-row" key={vehicle.vehicleId} type="button" onClick={() => onSelectVehicle(vehicle)}>
            <div className="row-icon">
              {vehicle.vehicleType === 'tram' ? <TrainFront size={18} /> : <BusFront size={18} />}
            </div>
            <div>
              <strong>{vehicleIdentifierLabel(vehicle)}</strong>
              <span>{formatDistance(distance)} · {vehicle.direction}</span>
            </div>
            <LineBadge line={vehicle.line} />
          </button>
        ))}
        {!showAllVehicles && matches.length > FIRST_PAGE ? (
          <button className="radar-more" type="button" onClick={() => setShowAllVehicles(true)}>
            Vedi tutti i {matches.length} mezzi
          </button>
        ) : null}
      </section>

      <section className="list-section">
        <div className="list-result-count">
          {nearbyStops.length === 0
            ? 'Nessuna palina in questo raggio'
            : `${plural(nearbyStops.length, 'palina', 'paline')} nel raggio di ${radiusOptions.find((option) => option.value === radius)?.label}`}
        </div>
        {(showAllStops ? nearbyStops : nearbyStops.slice(0, FIRST_PAGE)).map(({ stop, distance }) => (
          <button className="vehicle-row" key={stop.id} type="button" onClick={() => onSelectStop(stop)}>
            <div className="row-icon">
              <MapPinned size={18} />
            </div>
            <div>
              <strong>{stop.name}</strong>
              <span>{formatDistance(distance)}{stop.code ? ` · palina ${stop.code}` : ''}</span>
            </div>
          </button>
        ))}
        {!showAllStops && nearbyStops.length > FIRST_PAGE ? (
          <button className="radar-more" type="button" onClick={() => setShowAllStops(true)}>
            Vedi tutte le {nearbyStops.length} paline
          </button>
        ) : null}
      </section>

      <FeedDelayTuning />
    </main>
  );
}
