# Passaggio di consegne

Nota lasciata da un agente per il successivo. Chi riprende il lavoro la legge **prima** di pianificare qualsiasi modifica, insieme a [`project-reference.md`](project-reference.md).

Chi la scrive la aggiorna alla fine del proprio turno: si sostituisce la voce precedente quando è stata assorbita, non si accumulano cronologie. La storia completa sta in `git log`.

---

## Ultimo aggiornamento: 2026-08-09 · sessione Claude Code

### Stato al momento della consegna

| | |
| --- | --- |
| ramo di lavoro | `claude/tandem-codex-workflow-v1nntw` |
| pull request aperta | **#6**, verde, **non unita** |
| già unito in `main` | PR #5 |
| deploy | l'ultimo deploy di `main` è andato a buon fine |

> ⚠️ **Finché la #6 è aperta, non toccare quel ramo.** È la regola in `AGENTS.md`: un agente non commita, non rebasa e non forza il push sul ramo di un altro. Se serve intervenire su quel lavoro, attendere il merge e ripartire da `main` aggiornato.

### Già unito in `main` (PR #5)

**Movimento dei mezzi sulla mappa.** Il feed GTT arriva vecchio di circa un minuto e quel ritardo veniva assorbito al momento del playback, con tre effetti visibili:

- accelerazione irreale: un salto lungo veniva compresso in 18 secondi, rendendo un bus a 100 km/h. Ora la durata dipende dalla distanza e non supera mai una velocità plausibile;
- marcia indietro: compensazione della latenza troppo corta, aggancio alla shape che si ribaltava tra andata e ritorno, e nessuna protezione dal rumore GPS per i mezzi non agganciati;
- freccia direzionale con offset fisso sopra il badge: ora gira attorno al badge e precede il mezzo, e sparisce quando la direzione non è affidabile.

Le costanti che regolano tutto questo sono elencate in `project-reference.md` §4. **Vanno cambiate una alla volta**: sono in equilibrio tra loro.

### In attesa di merge (PR #6)

Quattro interventi. Se la #6 è già stata unita quando leggi, considera questa sezione storia.

1. **Orari delle paline agganciati alla fermata sbagliata.** L'ordinale `stop_sequence` veniva accettato *in alternativa* all'id fermata, non come ripiego. Su un campione di 300 paline il 65% degli arrivi candidati apparteneva a un'altra fermata. Ora l'id decide, anche in negativo.
2. **Gli orari programmati non sono più un file unico.** Erano 42 MB scaricati da ogni visitatore e circa 107 MB di heap. Ora sono indicizzati per fermata in 256 bucket: calendario condiviso da ~460 kB più un bucket da massimo ~210 kB. Heap 121,6 → 46,7 MB, traffico 53,6 → 12,8 MB.
3. **Tipo del mezzo dedotto dalla matricola.** Un bus che sostituisce un tram veniva tipizzato dalla linea, falliva il riconoscimento e finiva su `generic-tram`, l'unico cluster senza render. Ora decide la matricola quando è inequivocabile, con la linea come ripiego.
4. **Render della flotta**: da PNG 2048px a WebP 1280px (74,5 → 1,9 MB), rimossi 115,4 MB di versioni superate, workflow di generazione parametrizzato sulla chiave del cluster.

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
3. **Le tre correzioni visibili**, sull'app dopo il merge: i mezzi non accelerano più in modo innaturale e non tornano indietro; una palina mostra orari che coincidono con quelli ufficiali GTT; la vettura 817 sulla linea 16 mostra «Irisbus Citelis 18m» con il suo render e la nota di servizio sostitutivo, invece di «modello non identificato».

### Se cerchi il prossimo lavoro

- Il chunk `RouteDirectionSelector` supera 1 MB e la build lo segnala a ogni esecuzione.
- La versione applicativa è scritta a mano in `AppHeader.tsx` e `MoreScreen.tsx` e va aggiornata in entrambi.
- La finestra degli orari programmati è di 30 ore, quindi una palina poco servita mostra corse del giorno dopo senza etichetta di data.
- Le sprite dei mezzi sulla mappa (`public/assets/vehicles/*.png`) sono rimaste PNG: circa 660 kB che si potrebbero ridurre come è stato fatto per i render di dettaglio.
