// Corse programmate, per disegnare come "non accertate" i servizi di cui il
// realtime non dice nulla.
//
// Ogni variante porta un profilo — a quanti secondi dalla partenza il mezzo si
// trova a quale metro del percorso — e l'elenco delle partenze dal capolinea.
// Una corsa in svolgimento adesso è una partenza il cui profilo non è ancora
// esaurito, e la posizione è l'interpolazione fra due ancore.
//
// L'artefatto lo scrive `scripts/generate-scheduled-runs.mjs` a partire dagli
// stessi orari pubblicati per le paline. Ricostruirlo a runtime vorrebbe dire
// scaricare 24 MB di bucket su un telefono; così sono 410 kB compressi, chiesti
// solo quando servono davvero.

import type { StopScheduleCalendar } from './stopSchedule';

type ScheduledRunsPayload = {
  generatedAt: string;
  services: string[];
  variants: Array<{
    id: string;
    line: string;
    runs: Array<[number, number]>;
    anchors: Array<[number, number]>;
  }>;
};

export type ScheduledRun = {
  routeVariantId: string;
  line: string;
  /** Quanto la corsa ha percorso, in metri lungo la shape. */
  meters: number;
  /** Da quanti secondi è partita: serve a distinguere due corse della stessa linea. */
  departureSeconds: number;
  serviceDayOffsetSeconds: number;
};

let payloadPromise: Promise<ScheduledRunsPayload | undefined> | undefined;

export function fetchScheduledRuns() {
  payloadPromise ??= fetch(`${import.meta.env.BASE_URL}assets/scheduled-runs.json`)
    .then((response) => (response.ok ? (response.json() as Promise<ScheduledRunsPayload>) : undefined))
    .catch(() => undefined);
  return payloadPromise;
}

let loadedPayload: ScheduledRunsPayload | undefined;
export function peekScheduledRuns() {
  return loadedPayload;
}

export async function loadScheduledRuns() {
  loadedPayload ??= await fetchScheduledRuns();
  return loadedPayload;
}

function localGtfsDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function serviceRunsOn(serviceId: string | undefined, calendar: StopScheduleCalendar | undefined, date: Date) {
  if (!serviceId) return false;
  // Senza calendario non si può sapere se il servizio è in esercizio, e una
  // corsa inventata di domenica è peggio di una corsa mancante.
  if (!calendar) return false;
  const dayKey = localGtfsDate(date);
  const exception = calendar.exceptions[dayKey]?.[serviceId];
  if (exception === 1) return true;
  if (exception === 2) return false;
  const service = calendar.services[serviceId];
  if (!service) return false;
  return dayKey >= service.startDate && dayKey <= service.endDate && service.days[date.getDay()] === 1;
}

function metersAtElapsed(anchors: Array<[number, number]>, elapsedSeconds: number) {
  if (elapsedSeconds < 0) return undefined;
  const last = anchors[anchors.length - 1];
  if (elapsedSeconds > last[1]) return undefined;

  for (let index = 1; index < anchors.length; index += 1) {
    const [meters, seconds] = anchors[index];
    const [previousMeters, previousSeconds] = anchors[index - 1];
    if (elapsedSeconds <= seconds) {
      const span = seconds - previousSeconds;
      const share = span > 0 ? (elapsedSeconds - previousSeconds) / span : 0;
      return previousMeters + (meters - previousMeters) * share;
    }
  }
  return last[0];
}

/**
 * Le corse che a quest'ora dovrebbero essere in strada, per le linee che il
 * chiamante dichiara scoperte dal realtime.
 *
 * Il giorno di servizio GTFS supera la mezzanotte, quindi una corsa partita
 * ieri sera può essere ancora in viaggio: si guarda anche al giorno precedente.
 */
export function scheduledRunsInProgress(
  now: Date,
  calendar: StopScheduleCalendar | undefined,
  isLineUncovered: (line: string) => boolean,
  limit = 500,
) {
  const payload = loadedPayload;
  if (!payload || !calendar) return [];

  const secondsToday = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const runs: ScheduledRun[] = [];

  for (const variant of payload.variants) {
    if (runs.length >= limit) break;
    if (!isLineUncovered(variant.line)) continue;

    for (const [serviceIndex, departureSeconds] of variant.runs) {
      if (runs.length >= limit) break;
      const serviceId = payload.services[serviceIndex];

      // Due letture della stessa partenza: come corsa di oggi, e come corsa di
      // ieri ancora in viaggio dopo la mezzanotte.
      for (const dayOffset of [0, 86_400]) {
        const date = dayOffset === 0 ? now : yesterday;
        if (!serviceRunsOn(serviceId, calendar, date)) continue;
        const elapsed = secondsToday + dayOffset - departureSeconds;
        const meters = metersAtElapsed(variant.anchors, elapsed);
        if (meters == null) continue;
        runs.push({
          routeVariantId: variant.id,
          line: variant.line,
          meters,
          departureSeconds,
          serviceDayOffsetSeconds: dayOffset,
        });
        break;
      }
    }
  }

  return runs;
}
