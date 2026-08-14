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

// **Misurato dalla strada il 2026-08-12, non più supposto.** Con la manopola a
// 80 s lo scarto residuo fra il mezzo vero e il suo puntino era di 6-7 secondi,
// ed è il valore che l'aritmetica prevede per un'età assunta *giusta*: 15 s
// dichiarati più 80 fanno 95 s creduti, di cui se ne compensano 88,2 per via del
// margine di confidenza del 10%. I 6-7 secondi che restano sono quel margine,
// non un errore di stima.
//
// Prima di questa misura il valore era 20 s: copriva meno di un quarto del
// ritardo reale, ed è il motivo per cui i mezzi si vedevano indietro di un
// minuto abbondante.
//
// **Chi lo cambia rifaccia la prova**, non lo deduca: il feed nega di avere un
// ritardo, quindi nessuna lettura dei dati può confermarlo o smentirlo.
export const DEFAULT_UNDECLARED_FEED_DELAY_SECONDS = 80;

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
