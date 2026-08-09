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

**Movimento dei mezzi.** Il feed GTT arriva vecchio di circa un minuto. Tre effetti visibili, tutti corretti: un salto lungo veniva compresso in 18 secondi e rendeva un bus a 100 km/h; la compensazione della latenza era troppo corta e l'aggancio alla shape si ribaltava tra andata e ritorno, facendo tornare indietro i mezzi; la freccia direzionale stava sopra il badge con offset fisso e puntava verso il badge stesso quando il mezzo andava a sud.

Soprattutto: **l'età del campione si misura dal timestamp del veicolo con ricaduta sull'header del feed**. Senza quella ricaduta un campione privo di timestamp veniva creduto appena generato e la compensazione non si attivava affatto, lasciando il marker indietro di un intero ciclo. Le costanti stanno in `project-reference.md` §4 e **vanno cambiate una alla volta**.

**Orari delle paline.** Due interventi distinti. L'ordinale `stop_sequence` veniva accettato in alternativa all'id fermata: su 300 paline il 65% degli arrivi apparteneva a un'altra fermata. E la selezione mostrava la prima corsa di ogni linea, riempiendo l'elenco di notturni a 19 ore di distanza accanto ad arrivi imminenti. Ora: finestra di 90 minuti, massimo 3 corse per linea, rilassato a 8 se la palina è servita da una linea sola, e il giorno diverso scritto a parole.

**Peso all'avvio.** Gli orari programmati erano un file unico da 42 MB scaricato da ogni visitatore. Ora sono indicizzati per fermata in 256 bucket: heap 121,6 → 46,7 MB, traffico 53,6 → 12,8 MB, primo paint 792 → 334 ms.

**Identificazione della flotta.** Il tipo del mezzo lo decide la matricola quando è inequivocabile, con la linea come ripiego: un bus che sostituisce un tram non diventa più un tram inesistente, e la scheda dichiara la sostituzione.

**Render della flotta.** Da PNG 2048px a WebP 1280px: 74,5 → 1,9 MB, rimossi 115,4 MB di versioni superate. Il render della serie 5000 è stato **rigenerato**: il precedente aveva bordi frastagliati già nella sorgente, nascosti finché il fondo era bianco.

### Convenzioni introdotte, da rispettare

- **La funzione di bucket degli orari è duplicata** in `frontend/scripts/stop-schedule.mjs` e `frontend/src/services/stopSchedule.ts`. Se ne cambi una, cambia l'altra: altrimenti una palina chiede il bucket sbagliato e risulta senza corse.
- **Il prompt dei render vive nel catalogo**, non nel workflow. Se un render non va bene si corregge `renderPrompt` in `gttFleetCatalog.ts` e si rigenera; non si ritocca il file, la rigenerazione perderebbe la correzione.
- **I render stanno entro 400 kB e devono essere referenziati.** `npm run verify:assets` fallisce altrimenti.
- **`generic-tram` resta senza render di proposito.** Se le matricole che ci finiscono appartengono a una serie reale, si aggiunge la serie in `vehicleFleetRules.ts`.
- **Il percorso di un render è scritto in due file**: `gttFleetCatalog.ts` e `vehicleFleet.ts`. L'interfaccia legge il secondo. Spostarne uno solo significa dichiarare validato un render che l'app non mostra.
- **Sostituendo il contenuto di un asset, cambiare anche il nome del file.** `public/` viene servito a URL stabile, senza hash: a parità di nome la cache continua a restituire la versione vecchia.
- **Un render che arriva con canale alpha va appiattito sul fondo studio**, non lasciato passare e non appiattito sul bianco. Lo script di generazione ora lo fa da sé.
- **GitHub Actions non può aprire pull request in questo repository.** Il workflow dei render pubblica il ramo e stampa il link; si abilita da *Settings → Actions → General*.
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
