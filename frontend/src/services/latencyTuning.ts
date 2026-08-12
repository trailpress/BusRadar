// Il ritardo che il feed GTT non dichiara, e la manopola per misurarlo.
//
// GTT consegna campioni marcati come appena rilevati mentre la posizione è di
// prima. Quel "di prima" non si legge da nessun campo: è l'unico numero del
// progetto che si può ottenere solo stando a una fermata e guardando insieme il
// mezzo vero e il suo puntino. Finché era una costante nel codice, ogni
// tentativo costava un deploy e una seconda uscita in strada.
//
// Qui è un valore modificabile dall'app e ricordato dal browser: chi fa la
// prova può correggerlo mentre il bus gli passa davanti, e la taratura giusta
// si trova in un pomeriggio invece che in una settimana.
//
// Il valore trovato va poi riportato in `DEFAULT_UNDECLARED_FEED_DELAY_SECONDS`
// e in `docs/project-reference.md`, altrimenti resta sul telefono di chi l'ha
// misurato e nessun altro lo vede.

// Alzato da 20 a 60 il 2026-08-12: dalla strada il marker risultava indietro di
// almeno un minuto rispetto al mezzo vero **e** rispetto al sito GTT, che legge
// lo stesso feed. Venti secondi erano una supposizione, questa è
// un'osservazione - ancora sommaria, ma di segno inequivocabile.
export const DEFAULT_UNDECLARED_FEED_DELAY_SECONDS = 60;

const STORAGE_KEY = 'busradar.undeclaredFeedDelaySeconds';
// Oltre i due minuti non è più una latenza da compensare: è un campione da
// dichiarare vecchio. Sotto zero non ha significato.
export const MIN_UNDECLARED_FEED_DELAY_SECONDS = 0;
export const MAX_UNDECLARED_FEED_DELAY_SECONDS = 120;

let cached: number | undefined;

function readStored(): number | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? clamp(value) : undefined;
  } catch {
    // Safari in navigazione privata rifiuta localStorage: si torna al default,
    // non si rompe la mappa.
    return undefined;
  }
}

export function clamp(seconds: number) {
  return Math.min(
    MAX_UNDECLARED_FEED_DELAY_SECONDS,
    Math.max(MIN_UNDECLARED_FEED_DELAY_SECONDS, Math.round(seconds)),
  );
}

export function undeclaredFeedDelaySeconds() {
  cached ??= readStored() ?? DEFAULT_UNDECLARED_FEED_DELAY_SECONDS;
  return cached;
}

export function setUndeclaredFeedDelaySeconds(seconds: number) {
  cached = clamp(seconds);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(cached));
  } catch {
    // Il valore resta valido per questa sessione anche se non si può salvare.
  }
  return cached;
}

export function resetUndeclaredFeedDelaySeconds() {
  cached = DEFAULT_UNDECLARED_FEED_DELAY_SECONDS;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem
  }
  return cached;
}

export function isUndeclaredFeedDelayCustom() {
  return readStored() != null;
}
