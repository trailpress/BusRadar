import { PIEDMONT_FALLBACK_BOUNDS } from '../data/gtfsNetwork';
import type { LatLng } from '../types';

/**
 * BusRadar può essere aperto già puntato su qualcosa. Serve a Turni Smart, che
 * dal chip del turno vettura apre questa app in un iframe per mostrare dov'è il
 * mezzo di quel turno; l'indirizzo lo costruisce `src/utils/busRadar.js` in quel
 * repository.
 *
 * I parametri letti sono quattro:
 *
 * - `vettura=1234` una o più matricole separate da virgola: si aggancia quel mezzo;
 * - `linea=71` filtra i mezzi e disegna il percorso;
 * - `lat=..&lon=..` dove inquadrare quando la matricola non c'è;
 * - `embed=<testo>` siamo dentro il frame di un'altra app, quindi niente BottomNav.
 *
 * **Il turno vettura non si può passare, e non è una dimenticanza**: nel feed
 * GTFS-RT di GTT non esiste. Il feed porta la matricola e la linea, e il
 * `tripId` arriva vuoto. Chi ha la matricola punta il mezzo, chi non ce l'ha
 * ottiene la linea.
 */
export type BusRadarDeepLink = {
  /** Matricole richieste, nell'ordine in cui sono state chieste. */
  fleetNumbers: string[];
  line?: string;
  focus?: LatLng;
  embed: boolean;
};

/**
 * Lo stesso tetto che Turni Smart applica prima di comporre l'indirizzo. Chi
 * arriva con cinquanta matricole non sta chiedendo «dov'è il mio mezzo».
 */
const MAX_FLEET_NUMBERS = 8;

/**
 * Le matricole arrivano scritte a mano, quindi «0817» e «817» sono lo stesso
 * mezzo e vanno confrontate come tali.
 */
export function normalizeFleetToken(value: string) {
  return value.trim().toLowerCase().replace(/^0+(?=.)/, '');
}

function readFleetNumbers(raw: string | null) {
  if (!raw) return [];
  const seen = new Set<string>();
  const numbers: string[] = [];
  raw.split(',').forEach((part) => {
    const token = part.trim();
    if (!token) return;
    const key = normalizeFleetToken(token);
    if (seen.has(key)) return;
    seen.add(key);
    numbers.push(token);
  });
  return numbers.slice(0, MAX_FLEET_NUMBERS);
}

/**
 * Un punto fuori scala viene **scartato, non riportato al limite**: correggerlo
 * produrrebbe un punto inventato sul bordo della mappa, che si legge come una
 * posizione vera. Il riquadro è quello largo quanto il Piemonte, perché quando
 * l'indirizzo viene letto la rete GTFS non è ancora caricata e perché il suo
 * compito è respingere le assurdità, non ritagliare la copertura.
 */
function readFocus(rawLat: string | null, rawLon: string | null): LatLng | undefined {
  if (rawLat == null || rawLon == null) return undefined;
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  const bounds = PIEDMONT_FALLBACK_BOUNDS;
  if (lat < bounds.minLat || lat > bounds.maxLat) return undefined;
  if (lon < bounds.minLon || lon > bounds.maxLon) return undefined;
  return { lat, lon };
}

/**
 * La matricola richiesta contro il mezzo che il feed ha portato. Si guarda
 * anche il `vehicleId` perché per una parte dei mezzi è l'unica identità che il
 * feed dichiara, e chi apre l'indirizzo ha in mano il numero scritto sul mezzo,
 * non la distinzione fra i due campi.
 */
export function matchesFleetToken(token: string, vehicle: { fleetNumber?: string; vehicleId: string }) {
  const wanted = normalizeFleetToken(token);
  if (!wanted) return false;
  return (
    normalizeFleetToken(vehicle.fleetNumber ?? '') === wanted
    || normalizeFleetToken(vehicle.vehicleId) === wanted
  );
}

export function readBusRadarDeepLink(search = window.location.search): BusRadarDeepLink {
  const params = new URLSearchParams(search);
  const line = params.get('linea')?.trim();
  const embed = params.get('embed')?.trim();
  return {
    fleetNumbers: readFleetNumbers(params.get('vettura')),
    line: line || undefined,
    focus: readFocus(params.get('lat'), params.get('lon')),
    embed: Boolean(embed),
  };
}
