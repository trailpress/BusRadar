# Passaggio di consegne

Nota lasciata da un agente per il successivo. Chi riprende il lavoro la legge **prima** di pianificare qualsiasi modifica, insieme a [`project-reference.md`](project-reference.md).

Chi la scrive la aggiorna alla fine del proprio turno: si sostituisce la voce precedente quando è stata assorbita, non si accumulano cronologie. La storia completa sta in `git log`.

---

## Ultimo aggiornamento: 2026-08-09 · sessione Claude Code

### Stato al momento della consegna

| | |
| --- | --- |
| pull request aperte | **nessuna** |
| ultimo merge in `main` | PR #6 |
| ramo `claude/tandem-codex-workflow-v1nntw` | interamente unito, libero |
| deploy | pubblicato da `main` dopo il merge |

Non c'è lavoro in sospeso e nessun ramo da evitare. Chi riprende parte da `main` aggiornato con un ramo nuovo del proprio prefisso.

### Cosa è cambiato in questo turno

Tutto quanto segue è **già in produzione**.

**Movimento dei mezzi sulla mappa** (PR #5). Il feed GTT arriva vecchio di circa un minuto e quel ritardo veniva assorbito al momento del playback, con tre effetti visibili:

- accelerazione irreale: un salto lungo veniva compresso in 18 secondi, rendendo un bus a 100 km/h. Ora la durata dipende dalla distanza e non supera mai una velocità plausibile;
- marcia indietro: compensazione della latenza troppo corta, aggancio alla shape che si ribaltava tra andata e ritorno, e nessuna protezione dal rumore GPS per i mezzi non agganciati;
- freccia direzionale con offset fisso sopra il badge: ora gira attorno al badge e precede il mezzo, e sparisce quando la direzione non è affidabile.

Le costanti che regolano tutto questo sono elencate in `project-reference.md` §4. **Vanno cambiate una alla volta**: sono in equilibrio tra loro.

**Orari delle paline** (PR #6). L'ordinale `stop_sequence` veniva accettato *in alternativa* all'id fermata, non come ripiego. Su un campione di 300 paline il 65% degli arrivi candidati apparteneva a un'altra fermata. Ora l'id decide, anche in negativo.

**Peso all'avvio** (PR #6). Gli orari programmati erano un file unico da 42 MB scaricato da ogni visitatore, per circa 107 MB di heap. Ora sono indicizzati per fermata in 256 bucket: calendario condiviso da ~460 kB più un bucket da massimo ~210 kB. Heap 121,6 → 46,7 MB, traffico 53,6 → 12,8 MB, primo paint 792 → 334 ms.

**Identificazione della flotta** (PR #6). Un bus che sostituisce un tram veniva tipizzato dalla linea, falliva il riconoscimento e finiva su `generic-tram`, l'unico cluster senza render. Ora il tipo lo decide la matricola quando è inequivocabile, con la linea come ripiego, e la sostituzione viene dichiarata nella scheda.

**Render della flotta** (PR #6). Da PNG 2048px a WebP 1280px: 74,5 → 1,9 MB, e una scheda mezzo scarica ~50 kB invece di ~2,6 MB. Rimossi 115,4 MB di versioni superate. Il workflow di generazione è ora unico e parametrizzato sulla chiave del cluster.

### Convenzioni introdotte, da rispettare

- **La funzione di bucket degli orari è duplicata** in `frontend/scripts/stop-schedule.mjs` e `frontend/src/services/stopSchedule.ts`. Se ne cambi una, cambia l'altra: altrimenti una palina chiede il bucket sbagliato e risulta senza corse.
- **Il prompt dei render vive nel catalogo**, non nel workflow. Se un render non va bene si corregge `renderPrompt` in `gttFleetCatalog.ts` e si rigenera; non si ritocca il file, la rigenerazione perderebbe la correzione.
- **I render stanno entro 400 kB e devono essere referenziati.** `npm run verify:assets` fallisce altrimenti.
- **`generic-tram` resta senza render di proposito.** Se le matricole che ci finiscono appartengono a una serie reale, si aggiunge la serie in `vehicleFleetRules.ts`.
- **`npm run verify:routes` controlla la scadenza del dataset GTFS**: fallisce se è scaduto, avvisa negli ultimi 30 giorni. Attualmente valido fino al **20261231**.

### Cosa non è stato verificato, e serve qualcuno con rete aperta

L'ambiente di questa sessione ha la rete verso l'esterno negata dalla policy: `percorsieorari.gtt.to.it`, `www.gtt.to.it` e Supabase rispondono 403 sul CONNECT. Di conseguenza **nessun percorso realtime è stato esercitato sul feed vivo**. Tutto il resto è stato verificato sul dataset statico reale e con una sessione browser sull'app in esecuzione.

Se il tuo ambiente ha accesso a internet, queste sono le verifiche che valgono di più:

1. **Il feed GTFS-RT risponde ancora?** `https://percorsieorari.gtt.to.it/das_gtfsrt/vehicle_position.aspx` e `trip_update.aspx`, e la Edge Function `gtt-realtime` che li espone.
2. **Esiste un GTFS statico più recente?** Quello incorporato è stato generato il **2026-07-12** (feed 20260711). GTT ripubblica periodicamente: se c'è una versione nuova, rigenerare con `npm run gtfs:generate` e aggiornare `docs/gtfs-static-validation.md`.
3. **Le tre correzioni visibili**, sul sito pubblicato: i mezzi non accelerano più in modo innaturale e non tornano indietro; una palina mostra orari che coincidono con quelli ufficiali GTT; la vettura 817 sulla linea 16 mostra «Irisbus Citelis 18m» con il suo render e la nota di servizio sostitutivo, invece di «modello non identificato».

### Se cerchi il prossimo lavoro

- Il chunk `RouteDirectionSelector` supera 1 MB e la build lo segnala a ogni esecuzione.
- La versione applicativa è scritta a mano in `AppHeader.tsx` e `MoreScreen.tsx` e va aggiornata in entrambi.
- La finestra degli orari programmati è di 30 ore, quindi una palina poco servita mostra corse del giorno dopo senza etichetta di data.
- Le sprite dei mezzi sulla mappa (`public/assets/vehicles/*.png`) sono rimaste PNG: circa 660 kB che si potrebbero ridurre come è stato fatto per i render di dettaglio.
