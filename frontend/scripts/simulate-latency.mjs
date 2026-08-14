// Banco di prova della compensazione della latenza.
//
// Il feed GTT non è raggiungibile da tutti gli ambienti di sviluppo, e anche
// dove lo è non si può chiedere a un autobus di ripetere la stessa manovra per
// confrontare due tarature. Qui la manovra si ripete: un mezzo urbano in
// traffico irregolare, un feed vecchio di un minuto che si dichiara fresco, e
// il marker che ciascuna variante dell'algoritmo disegnerebbe per lui.
//
// Le tre metriche che contano, e che si leggono insieme:
//
//   davanti     il marker ha superato il mezzo e lo aspetta fermo più avanti
//   mediana     il ritardo abituale, quello che si vede sulla mappa
//   punta       la velocità del marker: sopra gli 11-12 m/s è uno scatto
//               che il mezzo non ha mai fatto
//
// Non esiste una variante che vinca su tutte: chi riduce il sorpasso paga in
// ritardo. Serve a scegliere consapevolmente il punto del compromesso, non a
// trovare un ottimo che non c'è.
//
// I valori replicano quelli di `src/services/gttRealtime.ts`. Cambiando le
// costanti là, vanno riallineate anche qui, altrimenti il banco misura un
// algoritmo che non è più quello in produzione.
//
// Un mezzo con cadenza perfettamente regolare non supera mai: la media mobile
// coincide con la media sulla finestra del ritardo, e l'errore è solo ritardo.
// Il sorpasso nasce dall'irregolarità — un semaforo lungo, una fermata
// affollata — quando la media recente è alta e il minuto appena trascorso è
// stato speso fermi.

// Il ritardo non dichiarato del feed: GTT consegna campioni marcati come appena
// misurati mentre la posizione e' di prima. Non e' mai stato misurato dalla
// strada - e' la supposizione su cui poggia tutta la tabella - quindi si puo'
// spostare da riga di comando, `--ritardo 45`, e con `--sensibilita` si legge
// quanto cambia la risposta al variare di quel numero.
const delayArgument = process.argv.indexOf('--ritardo');
let FEED_DELAY = delayArgument > -1 ? Number(process.argv[delayArgument + 1]) : 60;
// Misurato sul feed vero il 2026-08-10: l'header sta a 15:59:46 e i campioni
// portano timestamp fra 15:59:16 e 15:59:37. Il feed dichiara quindi 10-30
// secondi di età, non i 3 che si erano supposti da uno screenshot.
const DECLARED_AGE = 15;
const POLL = 10;
const SPACING = 300;
const HORIZON = 3600;
const STEP = 1;

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A run of the line, second by second: cruise between stops at an irregular
// pace, dwell for an irregular time, and now and then sit at a light.
function buildRun(seed) {
  const random = mulberry32(seed);
  const positions = [0];
  let position = 0;
  let nextStop = SPACING;
  while (positions.length <= HORIZON + FEED_DELAY + 10) {
    const cruise = 5 + random() * 6;
    while (position < nextStop && positions.length <= HORIZON + FEED_DELAY + 10) {
      position += cruise * STEP;
      positions.push(position);
      if (random() < 0.012) {
        // A light, a queue, a pedestrian crossing.
        const halt = 15 + random() * 50;
        for (let second = 0; second < halt; second += STEP) positions.push(position);
      }
    }
    nextStop += SPACING;
    const dwell = random() < 0.25 ? 0 : 8 + random() * 35;
    for (let second = 0; second < dwell; second += STEP) positions.push(position);
  }
  // When the vehicle truly reaches each stop. GTT predicts these times in the
  // TripUpdate feed, well or badly; the simulation adds the error separately.
  const arrivals = new Map();
  let stopIndex = 0;
  for (let second = 0; second < positions.length; second += 1) {
    while (positions[second] >= (stopIndex + 1) * SPACING) {
      stopIndex += 1;
      arrivals.set(stopIndex * SPACING, second);
    }
  }

  return { positions, arrivals };
}

const stops = [];
for (let meters = SPACING; meters < 60000; meters += SPACING) stops.push(meters);

function positionAfterSeconds(fromMeters, seconds, speed, dwellSeconds) {
  let remaining = seconds;
  let position = fromMeters;
  for (const stop of stops) {
    if (stop <= position) continue;
    const toStop = (stop - position) / speed;
    if (toStop >= remaining) break;
    remaining -= toStop + dwellSeconds;
    position = stop;
    if (remaining <= 0) return position;
  }
  return position + remaining * speed;
}

function run(course, { dwellAware, rateLimited, fastDrop, floor, fraction = 0.35, cap = 75, confidence = 0.9, anchored, anchoredOnly, raw, scheduledPace, additive, predictionError = 20, seed = 1 }) {
  const { positions, arrivals } = course;
  // Il passo che l'orario programmato attribuisce al tratto: la media della
  // corsa, che è ciò che un orario codifica, non la velocità di un istante.
  const scheduledSegmentSeconds = SPACING / (positions[positions.length - 1] / positions.length);
  const noise = mulberry32(seed * 7919);
  let average;
  let advance = 0;
  let shown = -Infinity;
  const errors = [];
  const jumps = [];
  let longestStall = 0;
  let stallSince;
  let previousShown;

  for (let t = FEED_DELAY; t <= HORIZON; t += POLL) {
    const sampleIndex = t - FEED_DELAY;
    // The feed reports the pace observed between the last two samples, which is
    // what the app computes from consecutive positions.
    const observed = Math.max(0, (positions[sampleIndex] - positions[Math.max(0, sampleIndex - POLL)]) / POLL);
    const reported = positions[sampleIndex];

    if (average == null) average = observed;
    else {
      const slowing = observed < average;
      const weight = Math.min(1, Math.max(fastDrop && slowing ? 0.6 : 0.05, POLL / 60));
      average = average * (1 - weight) + observed * weight;
    }

    // additive: il ritardo non dichiarato si somma all'età dichiarata invece di
    // sostituirla. Con `max` un campione già vecchio non riceve alcuna correzione.
    const assumed = additive ? DECLARED_AGE + floor : Math.max(DECLARED_AGE, floor);
    // `cap` replica MAX_LATENCY_COMPENSATION_SECONDS: oltre quella soglia la
    // correzione non va, per quanto vecchio si creda il campione.
    const seconds = Math.min(assumed + 3, cap) * confidence;
    let target = 0;
    // `raw`: il marker sta dove il feed lo ha messo, punto. Nessuna proiezione,
    // nessuna interpolazione. Serve a quantificare cosa si guadagna e cosa si
    // perde rinunciando del tutto a stimare, invece di discuterne.
    // `anchoredOnly`: si interpola solo fra due istanti dichiarati - il
    // campione e la previsione di fermata - e dove la previsione manca il
    // marker resta sul dato grezzo, invece di ripiegare sulla velocita' stimata.
    if (!raw && !anchoredOnly && average >= 1.5 / 3.6) {
      target = dwellAware
        ? positionAfterSeconds(reported, seconds, average, 15) - reported
        : average * seconds;
    }

    // The timetable's pace for this segment, used when the feed announces
    // nothing: the position is still the feed's, only the speed comes from the
    // schedule.
    // Le tre stime si sovrascrivono nell'ordine in cui `gttRealtime.ts` le
    // preferisce: la velocita' misurata e' il ripiego, il passo dell'orario la
    // scavalca, la previsione GTT scavalca entrambe. Prima il banco le teneva
    // esclusive, e nessuna riga descriveva la catena che gira davvero.
    if (scheduledPace) {
      const nextStop = stops.find((stop) => stop > reported);
      if (nextStop != null) {
        const remaining = nextStop - reported;
        const expected = scheduledSegmentSeconds * (remaining / SPACING);
        if (expected > 0) target = remaining * Math.min(1, assumed / expected);
      }
    }

    // Anchoring: instead of extrapolating from a stale position, interpolate
    // between it and the next stop the operator says the vehicle will reach.
    // Two known instants with the vehicle between them, rather than one known
    // instant and a guess about the speed it has held since.
    if ((anchored || anchoredOnly) && !raw) {
      const nextStop = stops.find((stop) => stop > reported);
      const trueArrival = nextStop != null ? arrivals.get(nextStop) : undefined;
      // The prediction the feed would carry: right to within a few seconds, in
      // either direction. Predictions already passed are of no use.
      const predicted = trueArrival != null ? trueArrival + (noise() * 2 - 1) * predictionError : undefined;
      // The sample is believed to be `floor` seconds old, not the minute it
      // really is: the anchor inherits that error, and cannot escape it.
      // L'eta' creduta e' la stessa che usa la proiezione: in produzione
      // l'ancoraggio parte da `Date.now() - effectiveAgeSeconds`, cioe' dalla
      // somma. Qui restava la vecchia formula, e l'ancoraggio ignorava del
      // tutto la supposizione additiva - motivo per cui alzarla non muoveva
      // niente e il tetto sembrava ininfluente.
      const believedSampleAt = t - assumed;
      if (predicted != null && predicted > t && predicted > believedSampleAt) {
        const share = Math.min(1, Math.max(0, (t - believedSampleAt) / (predicted - believedSampleAt)));
        target = (nextStop - reported) * share;
      }
    }

    advance = rateLimited
      ? Math.min(advance + fraction * average * POLL, Math.max(advance - fraction * average * POLL, target))
      : target;

    // The marker never goes backwards, exactly as routeMotion refuses to.
    const marker = Math.max(shown, reported + advance);
    shown = marker;

    errors.push(positions[t] - marker);
    if (previousShown != null) {
      // How fast the marker itself travels, in m/s. A city bus tops out near
      // 11 m/s, so anything well above that is the lurch: the map showing a
      // burst of speed the vehicle never had.
      jumps.push((marker - previousShown) / POLL);
    }

    if (previousShown != null && marker - previousShown < 1) {
      stallSince ??= t - POLL;
      longestStall = Math.max(longestStall, t - stallSince);
    } else stallSince = undefined;
    previousShown = marker;
  }

  return { errors, longestStall, jumps };
}

function summarise(options) {
  const all = [];
  const allJumps = [];
  let worstStall = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const { errors, longestStall, jumps } = run(buildRun(seed), { ...options, seed });
    all.push(...errors);
    allJumps.push(...jumps);
    worstStall = Math.max(worstStall, longestStall);
  }
  allJumps.sort((a, b) => a - b);
  all.sort((a, b) => a - b);
  const at = (q) => all[Math.floor(q * (all.length - 1))];
  const ahead = all.filter((error) => error < -5).length / all.length;
  return {
    ahead5: -at(0.05),
    median: at(0.5),
    behind95: at(0.95),
    aheadShare: ahead,
    worstStall,
    jump99: allJumps[Math.floor(0.99 * (allJumps.length - 1))],
  };
}

const scenarios = [
  // Il fondo del confronto: il feed e basta. Tutto il resto va giudicato
  // rispetto a questa riga, non rispetto alle altre tarature fra loro.
  ['grezzo: solo il feed', { raw: true, floor: 35 }],
  ['solo ancoraggio, niente stima', { anchoredOnly: true, rateLimited: false, floor: 35 }],
  ['solo ancoraggio, con limite', { anchoredOnly: true, rateLimited: true, floor: 35 }],
  ['nessuna correzione (25 s)', { dwellAware: false, rateLimited: false, fastDrop: false, floor: 25 }],
  ['nessuna correzione (35 s)', { dwellAware: false, rateLimited: false, fastDrop: false, floor: 35 }],
  ['solo fermate a carico', { dwellAware: true, rateLimited: false, fastDrop: false, floor: 35 }],
  ['solo limite alla variazione', { dwellAware: false, rateLimited: true, fastDrop: false, floor: 35 }],
  ['in uso: limite + fermate', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 35 }],
  ['in uso, pavimento 45 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 45 }],
  ['in uso, pavimento 60 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 60 }],
  ['+ reazione al rallentamento', { dwellAware: true, rateLimited: true, fastDrop: true, floor: 35 }],
  ['passo da orario programmato', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 35, scheduledPace: true }],
  ['catena pre-ancoraggio', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 35 }],
  // ASSUMED_UNDECLARED_FEED_DELAY_SECONDS = 20 in gttRealtime.ts, sommati
  // ai 15 s dichiarati dal feed: la riga che descrive l'app pubblicata.
  ['IN PRODUZIONE oggi', { dwellAware: true, rateLimited: true, fastDrop: false, additive: true, floor: 20, anchored: true, scheduledPace: true }],
  ['additivo +20 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 20, additive: true }],
  ['additivo +30 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 30, additive: true }],
  ['additivo +40 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 40, additive: true }],
  ['ancorato alle previsioni', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 35, anchored: true }],
  ['ancorato, previsioni +/-40 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 35, anchored: true, predictionError: 40 }],
  ['ancorato, senza limite', { dwellAware: true, rateLimited: false, fastDrop: false, floor: 35, anchored: true }],
  ['ancorato, pavimento 45 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 45, anchored: true }],
  ['ancorato, pavimento 50 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 50, anchored: true }],
  ['ancorato, pavimento 60 s', { dwellAware: true, rateLimited: true, fastDrop: false, floor: 60, anchored: true }],
  // **Tarato dalla strada il 2026-08-12**: con la manopola a 80 s lo scarto
  // residuo osservato era di 6-7 secondi, che e' esattamente il margine di
  // confidenza (95 s creduti, 88,2 compensati). L'eta' assunta e' quindi
  // giusta; qui si misura se convenga chiudere anche quegli ultimi secondi.
  ['tarato: +80 s, margine 0,90', { dwellAware: true, rateLimited: true, additive: true, floor: 80, cap: 130, anchored: true, scheduledPace: true }],
  ['tarato: +80 s, margine 0,95', { dwellAware: true, rateLimited: true, additive: true, floor: 80, cap: 130, confidence: 0.95, anchored: true, scheduledPace: true }],
  ['tarato: +80 s, nessun margine', { dwellAware: true, rateLimited: true, additive: true, floor: 80, cap: 130, confidence: 1, anchored: true, scheduledPace: true }],
  // Candidate dopo la prova dalla strada del 2026-08-12: marker indietro di
  // almeno 60 s rispetto al mezzo vero e rispetto al sito GTT. Con la
  // compensazione attuale che copre ~39 s, il ritardo vero del feed risulta
  // vicino ai 90 s, oltre il tetto di 75 s: alzare la supposizione senza
  // alzare il tetto non cambia niente, ed e' il primo errore da non fare.
  ['piu 60 s, tetto 75 (invariato)', { dwellAware: true, rateLimited: true, additive: true, floor: 60, anchored: true, scheduledPace: true }],
  ['piu 60 s, tetto 110', { dwellAware: true, rateLimited: true, additive: true, floor: 60, cap: 110, anchored: true, scheduledPace: true }],
  ['piu 80 s, tetto 130', { dwellAware: true, rateLimited: true, additive: true, floor: 80, cap: 130, anchored: true, scheduledPace: true }],
  ['piu 60 s, tetto 110, freno 0,6', { dwellAware: true, rateLimited: true, additive: true, floor: 60, cap: 110, fraction: 0.6, anchored: true, scheduledPace: true }],
  ['piu 60 s, tetto 110, senza freno', { dwellAware: true, rateLimited: false, additive: true, floor: 60, cap: 110, anchored: true, scheduledPace: true }],
];

console.log('errore = posizione vera meno marker; negativo = marker davanti al mezzo\n');
console.log(
  'scenario'.padEnd(28),
  'davanti 5%'.padStart(11),
  'mediana'.padStart(9),
  'indietro 95%'.padStart(13),
  'quota avanti'.padStart(13),
  'fermo max'.padStart(10),
  'punta 99%'.padStart(10),
);
for (const [name, options] of scenarios) {
  const { ahead5, median, behind95, aheadShare, worstStall, jump99 } = summarise(options);
  console.log(
    name.padEnd(28),
    `${Math.round(ahead5)} m`.padStart(11),
    `${Math.round(median)} m`.padStart(9),
    `${Math.round(behind95)} m`.padStart(13),
    `${Math.round(aheadShare * 100)} %`.padStart(13),
    `${worstStall} s`.padStart(10),
    `${jump99.toFixed(1)} m/s`.padStart(10),
  );
}

// Quanto pesa la supposizione. Il grezzo paga solo ritardo, la produzione paga
// ritardo piu' sorpasso: dove le due curve si incrociano dipende interamente da
// quanto e' vecchio davvero il campione, che nessuno ha misurato.
if (process.argv.includes('--sensibilita')) {
  console.log('\nSensibilita al ritardo non dichiarato del feed\n');
  console.log(
    'ritardo'.padEnd(10),
    'grezzo mediana'.padStart(15),
    'grezzo avanti'.padStart(14),
    'produz. mediana'.padStart(16),
    'produz. avanti'.padStart(15),
    'costo del grezzo'.padStart(17),
  );
  for (const delay of [20, 30, 45, 60, 75, 90]) {
    FEED_DELAY = delay;
    const grezzo = summarise({ raw: true, floor: 35 });
    const oggi = summarise({ dwellAware: true, rateLimited: true, additive: true, floor: 20, anchored: true, scheduledPace: true });
    console.log(
      `${delay} s`.padEnd(10),
      `${Math.round(grezzo.median)} m`.padStart(15),
      `${Math.round(grezzo.aheadShare * 100)} %`.padStart(14),
      `${Math.round(oggi.median)} m`.padStart(16),
      `${Math.round(oggi.aheadShare * 100)} %`.padStart(15),
      `+${Math.round(grezzo.median - oggi.median)} m di ritardo`.padStart(17),
    );
  }
}
