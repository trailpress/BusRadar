import { useState } from 'react';
import { Timer, RotateCcw } from 'lucide-react';
import {
  DEFAULT_UNDECLARED_FEED_DELAY_SECONDS,
  MAX_UNDECLARED_FEED_DELAY_SECONDS,
  MIN_UNDECLARED_FEED_DELAY_SECONDS,
  isUndeclaredFeedDelayCustom,
  resetUndeclaredFeedDelaySeconds,
  setUndeclaredFeedDelaySeconds,
  undeclaredFeedDelaySeconds,
} from '../services/latencyTuning';

const STEP_SECONDS = 5;

// La taratura del ritardo del feed, fatta da chi vede il mezzo vero.
//
// Non e' una preferenza: e' uno strumento di misura. GTT manda posizioni gia'
// vecchie senza dire di quanto, e quel "di quanto" si scopre solo stando a una
// fermata. Finche' era una costante nel codice serviva un deploy per ogni
// tentativo, e chi faceva la prova doveva tornare in strada il giorno dopo.
export function FeedDelayTuning() {
  const [seconds, setSeconds] = useState(() => undeclaredFeedDelaySeconds());
  const [custom, setCustom] = useState(() => isUndeclaredFeedDelayCustom());

  const apply = (value: number) => {
    setSeconds(setUndeclaredFeedDelaySeconds(value));
    setCustom(true);
  };

  return (
    <section className="info-card feed-delay-card">
      <Timer size={22} />
      <div>
        <strong>Ritardo del feed GTT</strong>
        <p>
          Le posizioni GTT arrivano gia vecchie, e il feed non dice di quanto. La mappa
          recupera questo tempo: se il puntino resta <em>indietro</em> rispetto al mezzo vero,
          alzalo; se lo <em>supera</em>, abbassalo.
        </p>
        <div className="feed-delay-control">
          <button
            type="button"
            onClick={() => apply(seconds - STEP_SECONDS)}
            disabled={seconds <= MIN_UNDECLARED_FEED_DELAY_SECONDS}
            aria-label={`Riduci di ${STEP_SECONDS} secondi`}
          >
            −{STEP_SECONDS}
          </button>
          <output aria-live="polite">
            <strong>{seconds}</strong>
            <span>secondi</span>
          </output>
          <button
            type="button"
            onClick={() => apply(seconds + STEP_SECONDS)}
            disabled={seconds >= MAX_UNDECLARED_FEED_DELAY_SECONDS}
            aria-label={`Aumenta di ${STEP_SECONDS} secondi`}
          >
            +{STEP_SECONDS}
          </button>
        </div>
        <input
          type="range"
          className="feed-delay-slider"
          min={MIN_UNDECLARED_FEED_DELAY_SECONDS}
          max={MAX_UNDECLARED_FEED_DELAY_SECONDS}
          step={STEP_SECONDS}
          value={seconds}
          onChange={(event) => apply(Number(event.target.value))}
          aria-label="Ritardo non dichiarato del feed, in secondi"
        />
        <p className="feed-delay-note">
          {custom
            ? `Valore tuo, ricordato su questo telefono. Predefinito: ${DEFAULT_UNDECLARED_FEED_DELAY_SECONDS} s.`
            : `Valore tarato alla fermata il 12/08/2026. Rifai la prova se i mezzi ti sembrano fuori posto.`}
        </p>
        {custom ? (
          <button
            type="button"
            className="feed-delay-reset"
            onClick={() => {
              setSeconds(resetUndeclaredFeedDelaySeconds());
              setCustom(false);
            }}
          >
            <RotateCcw size={14} /> Torna al predefinito
          </button>
        ) : null}
      </div>
    </section>
  );
}
