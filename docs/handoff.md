# Passaggio di consegne

Nota lasciata da un agente per il successivo. Chi riprende il lavoro la legge **prima** di pianificare qualsiasi modifica, insieme a [`project-reference.md`](project-reference.md).

Chi la scrive la aggiorna alla fine del proprio turno: si sostituisce la voce precedente quando è stata assorbita, non si accumulano cronologie. La storia completa sta in `git log`.

---

## Ultimo aggiornamento: 2026-08-12 · sessione Claude Code

### Stato al momento della consegna

| | |
| --- | --- |
| pull request aperte | **nessuna** |
| ultimo merge in `main` | PR #43 |
| ramo `claude/tandem-codex-workflow-v1nntw` | interamente unito, libero |
| deploy | pubblicato da `main` dopo il merge di PR #43 (run verde) |

**Un ramo aspetta un giudizio, non un merge automatico: `claude/map-match-31471180628`.** Porta le shape agganciate alla rete stradale OSM — 91.979 buchi riempiti su 105.137, 873 varianti su 894 cambiate, passo mediano fra due vertici da 48,8 a 32,0 m, +198 kB gzip per chi apre l'app. Va guardato **sulla mappa, su una rotonda**, prima di unirlo: una geometria sbagliata precisa è peggio di una corda giusta. Porta anche `frontend/map-match-report.txt`, che **va tolto prima del merge**.

Restano sul repository **nove rami `claude/map-match-*` di prova** e i due rami `claude/render-generic-*` prodotti dal workflow dei render (il loro contenuto è già in `main`), da cancellare: dall'ambiente degli agenti il push di cancellazione è rifiutato.

### Cosa è cambiato in questo turno

Tutto quanto segue è **già in produzione**.

**Movimento dei mezzi.** Il feed GTT arriva vecchio di circa un minuto. Tre effetti visibili, tutti corretti: un salto lungo veniva compresso in 18 secondi e rendeva un bus a 100 km/h; la compensazione della latenza era troppo corta e l'aggancio alla shape si ribaltava tra andata e ritorno, facendo tornare indietro i mezzi; la freccia direzionale stava sopra il badge con offset fisso e puntava verso il badge stesso quando il mezzo andava a sud.

Soprattutto: **l'età del campione si misura dal timestamp del veicolo con ricaduta sull'header del feed**. Senza quella ricaduta un campione privo di timestamp veniva creduto appena generato e la compensazione non si attivava affatto, lasciando il marker indietro di un intero ciclo. Le costanti stanno in `project-reference.md` §4 e **vanno cambiate una alla volta**.

**Il feed GTT funziona: 294 mezzi, letti il 2026-08-10.** Non era mai stato verificato dal vivo. Tre supposizioni cadono: l'età dichiarata è di 10-30 s e non ~3 s, la `speed` è **sempre 0** su tutti i mezzi, il `tripId` è **sempre vuoto**. Quest'ultimo è il più pesante: l'ancoraggio alle previsioni di fermata può agganciarsi solo per matricola, mai per corsa. I dettagli sono in `project-reference.md` §4.

**Le previsioni GTT arrivano senza orario assoluto, solo con il ritardo.** L'aggancio per matricola funziona (la scheda ha risposto «previsioni senza orario futuro», non «nessuna previsione»), quindi l'orario si ricostruisce sommando il ritardo all'orario programmato della prossima fermata. Se un domani GTT cominciasse a mandare gli orari assoluti, quelli hanno la precedenza e il ricalcolo non si attiva nemmeno.

**La compensazione era spenta su gran parte dei mezzi, e nessuno se ne era accorto.** La `speed` del feed è sempre zero, quindi la velocità si ricava dallo spostamento; ma nei cicli senza campione nuovo veniva versato uno zero nella media, che convergeva a una frazione del vero e faceva scartare il mezzo come «fermo o troppo lento». Gran parte della taratura fatta prima di questa scoperta misurava quindi una correzione che spesso non si attivava. **Non rimettere lo zero nella media**: significa «non lo so», non «sta fermo».

**Il ritardo del feed non è più in taratura: è stato misurato.** Ottanta secondi, dalla fermata, il 2026-08-12 — il dettaglio è più sotto. Il protocollo e la tabella dei valori provati restano in `project-reference.md` §4, insieme ai risultati del banco di prova.

**`npm run smoke:map` apre l'app con un feed finto e controlla che i mezzi compaiano.** È l'unico controllo del progetto che esercita l'app in esecuzione: build e verify guardano tipi e dati. Ha già ripagato il costo scoprendo che le corse non accertate venivano calcolate dopo l'uscita anticipata sul feed vuoto, cioè non comparivano proprio nel caso per cui esistono. **Se qualcuno segnala una mappa con i tracciati e nessun mezzo sopra, si parte da qui**: distingue "il feed non manda niente" da "l'abbiamo rotta noi". Playwright non è una dipendenza, si installa al momento.

**Le corse non accertate vanno trattate con cautela.** Dove il feed tace su un'intera linea, le corse vengono disegnate dall'orario e dichiarate non accertate — grigie, sbiadite, con la dicitura in tre punti. Sono posizioni previste, non osservate: una corsa soppressa apparirebbe comunque. **Non allargare la regola che le genera**: basta un mezzo tracciato sulla linea perché non ne venga prodotta nessuna, ed è quello che impedisce di inventare mezzi su linee che il feed copre. `scheduled-runs.json` va rigenerato con `npm run gtfs:runs` ogni volta che si rigenera il dataset GTFS.

**Il riquadro di copertura del realtime ritagliava la rete interurbana.** Era scritto a mano e teneva fuori 1542 fermate su 7035: i mezzi verso Ivrea, la Val di Susa o Asti venivano scartati prima di arrivare alla mappa. Ora si misura dal dataset. Se qualcuno segnala mezzi che spariscono a metà corsa, questo è il primo posto da guardare.

**Tre fonti posizionano un mezzo, in ordine di prova migliore**: la previsione GTT per quella corsa, poi il passo che l'orario programmato dà a quel tratto di strada, poi la velocità recente del mezzo. La posizione GPS resta l'ancora in tutti e tre i casi. Dell'orario si prende **solo il passo, mai l'orologio**: così un mezzo in ritardo viene posizionato bene lo stesso, senza dover stimare il ritardo di esercizio. Attenzione al tetto sui bucket orari in `stopSchedule.ts` — l'insieme completo è 25 MB e scaricarlo per i marker rifarebbe il danno che il bucketing ha riparato.

**La posizione ora si ottiene interpolando, non estrapolando.** Quando il feed annuncia a che ora il mezzo raggiungerà le fermate successive, il marker viene messo fra il campione e quella fermata invece di essere lanciato in avanti a velocità stimata. È l'unico intervento che ha cambiato il meccanismo invece dell'ampiezza del difetto, e la scheda del mezzo dichiara quale delle due stime lo sta posizionando.

**Prima di ritoccare quella costante, usare `npm run simulate:latency`.** Il banco riproduce un mezzo urbano in traffico irregolare con il feed vecchio di un minuto, ed è l'unico modo di confrontare due tarature senza rete verso GTT. Ha già smentito due correzioni che sembravano ovvie: far entrare i rallentamenti più in fretta nella media conta due volte le soste, e mettere le fermate a carico della proiezione senza limitare anche la variazione peggiora gli scatti invece di ridurli. **Il compromesso fra sorpasso e ritardo è reale**: non esiste una variante che vinca su entrambi, e chi cerca l'ottimo perde tempo. Il sorpasso costa più del ritardo, perché diventa un marker fermo in mezzo alla strada.

**Orari delle paline.** Due interventi distinti. L'ordinale `stop_sequence` veniva accettato in alternativa all'id fermata: su 300 paline il 65% degli arrivi apparteneva a un'altra fermata. E la selezione mostrava la prima corsa di ogni linea, riempiendo l'elenco di notturni a 19 ore di distanza accanto ad arrivi imminenti. Ora: finestra di 90 minuti, massimo 3 corse per linea, rilassato a 8 se la palina è servita da una linea sola, e il giorno diverso scritto a parole.

**Peso all'avvio.** Gli orari programmati erano un file unico da 42 MB scaricato da ogni visitatore. Ora sono indicizzati per fermata in 256 bucket: heap 121,6 → 46,7 MB, traffico 53,6 → 12,8 MB, primo paint 792 → 334 ms.

**Identificazione della flotta.** Il tipo del mezzo lo decide la matricola quando è inequivocabile, con la linea come ripiego: un bus che sostituisce un tram non diventa più un tram inesistente, e la scheda dichiara la sostituzione.

**Render della flotta.** Da PNG 2048px a WebP 1280px: 74,5 → 1,9 MB, rimossi 115,4 MB di versioni superate.

**Il render della serie 5000 e' stato rifatto dall'API con la foto come riferimento.** La versione precedente era stata rigenerata **descrivendola a parole**, e la descrizione aveva perso il mezzo vero: e' quella che e' stata riconosciuta come inventata. Ora il generatore accetta una `referenceAsset` e allega l'immagine alla richiesta, quindi ridisegna quel tram invece di interpretarne una descrizione. La foto di partenza - probabilmente una fotografia scontornata, provenienza mai risultata da nessuna parte - **non sta piu' nel repository**: il render generato la sostituisce ed e' anche il riferimento per le prossime generazioni. Porta i marchi GTT e lo stemma della Citta' di Torino, senza matricola ne' numero di linea. **Le scritte vanno guardate ingrandite**: a figura intera una G stilizzata e una S non si distinguono, e in un giro il generatore aveva scritto "G-T-T" con i trattini perche' il prompt gliele dettava separate. Sono servite tre generazioni. Si rigenera dal workflow `generate-fleet-render`, che accetta un `variant` per non riscrivere lo stesso nome di file.

**Un mezzo fermo non va disegnato avanti, e ci sono due modi distinti di sbagliarlo.** Al semaforo: la media di velocità scende di un quarto a ogni campione GTT, quindi un mezzo che andava a 30 km/h e si ferma un minuto ha ancora una media di 9,5 km/h e viene proiettato **92 m avanti**; sotto la soglia di fermo ci arriva dopo quasi tre minuti. La media rispondeva alla domanda sbagliata — dice a che passo andava, non se adesso si muove — e alla seconda risponde l'ultima misura, subito. Alla fermata: l'ancoraggio punta alla fermata *successiva* appena il mezzo raggiunge quella che sta servendo, e ci corre verso mentre il mezzo carica; ora il marker resta alla fermata finché l'orario di ripartenza non è passato. **Non rimettere la media al posto dell'ultima misura per decidere se un mezzo è fermo.**

**Le frecce di direzione si prendono dal progresso lungo il percorso, non dalla riproiezione del punto.** La riproiezione non ha memoria e su una shape che si sovrappone a sé stessa ritrova il mezzo sul passaggio sbagliato, girando la freccia di 180°. Misurato sulle shape vere, le frecce rovesciate passano dal **2,0% allo 0,5%** e il 99° percentile dell'errore da 173° a 72°. La base di 40 metri da sola non bastava: toglieva gli scatti fra un vertice e l'altro, non la coda. La tabella completa è in `project-reference.md` §4.

**La velocità del mezzo serviva solo alla terza stima, ma le sbarrava tutte e tre.** Il cancello a 1,5 km/h stava prima dell'ancoraggio: un mezzo non ancora misurabile perdeva anche la previsione GTT, che è il dato migliore che abbiamo. Ora l'ordine è invertito. Insieme a questo, **fermo e non misurabile sono stati separati**: se una misura recente dice che il mezzo non si è mosso, nessun orario lo spinge avanti — è l'osservazione che vince, ed era questo a far scivolare il marker sempre più avanti del mezzo vero. La scheda distingue i due casi a parole, e `npm run smoke:map --feed-fermo` verifica che li distingua davvero.

**Un'opacità che dipende dalla feature costa un layer.** Le corse non accertate erano sbiadite moltiplicando l'interpolazione sullo zoom per uno sconto letto dalla feature: MapLibre rifiuta `['zoom']` dentro una moltiplicazione, quindi la proprietà era **invalida** e la dissolvenza spariva senza che si vedesse altro che un errore in console. Riscritta in forma valida diventava un attributo per feature e portava il fotogramma più lungo **da 17 a 128 ms**. La forma che regge è due layer separati da un filtro, ciascuno con opacità costante.

**Il limite più visibile della mappa non è nel codice: sono le shape GTT.** Fra un vertice e l'altro corrono 48,8 m di mediana e fino a 5,8 km; sulla rotonda di Via Lucio Battisti la linea 17 ha due vertici in 250 m, quindi la linea disegnata taglia la rotonda e il mezzo la taglia con lei. `simplify()` nel generatore non c'entra: non si attiva mai. La riparazione è il map-matching contro OSM nel generatore, che richiede un ambiente con rete verso OSM — da questa sessione è bloccato. **Non arrotondare la spezzata per farla sembrare meglio**: una curva morbida sbagliata è peggio di una spezzata sbagliata. I numeri sono in `project-reference.md` §10.

**La scheda di una corsa non accertata mostra la classe di servizio della linea, non un mezzo.** Prima non mostrava niente, e quel vuoto era peggio del problema: la domanda «che mezzo passa» resta legittima anche dove nessun mezzo è stato osservato. Cercato online: **nessun documento pubblico assegna i modelli alle singole linee** (e `www.gtt.to.it` è bloccato dal proxy), quindi la risposta si ferma alla classe, che il progetto sa già dedurre — numero di linea sopra il mille = extraurbana. I prompt sono ricavati dalle schede ufficiali già trascritte in `gttOfficialFleetSpecs.ts`: urbana, extraurbana (Iveco Crossway 12 m, la famiglia più numerosa: 50+46 diesel, 42 CNG, 41 LE, 2 porte) e tranviaria (serie 2800: 70 vetture, 20.145 mm, 2 casse). Tre chiavi separate — `generic-bus-urban`, `generic-bus-interurban`, `generic-tram-line` — e i render sono marcati `placeholder-render`: illustrano una classe, e chiamarli validati dichiarerebbe una verifica che non c'è stata.

**Sulla stessa scheda comparivano due identificativi inventati da noi.** L'id sintetico della corsa (`orario-90U-0-...`) era stampato dove va la matricola, e lo stesso identificativo tornava come mezzo «dietro» nell'intervallo di turno: entrambi si leggono come numeri di vettura reali. Ora della corsa resta il percorso GTFS, e il mezzo vicino è «Corsa da orario». Verificato nel browser su tutte e tre le classi con il feed vuoto; `npm run smoke:map --feed-vuoto` ora controlla render e didascalia.

**Il ritardo del feed non è più una supposizione: è 80 secondi, misurato alla fermata il 2026-08-12.** Era 20, cioè meno di un quarto del vero, ed è la ragione per cui i mezzi si vedevano indietro di un minuto abbondante — anche rispetto al sito GTT, che legge lo stesso feed. Alzarlo da solo non sarebbe bastato: due tetti tagliavano comunque la correzione, e sono saliti con lui (75 → 130 s, 700 → 1100 m). Lo scarto che resta, 6-7 secondi, **è il margine di confidenza del 10%**, non un errore di taratura: sta dalla parte sicura, con il marker un poco indietro invece che davanti. Azzerarlo porterebbe il marker in media 3 s oltre il mezzo, cioè nell'errore che costa di più.

**La manopola per rifare quella misura sta nell'app, schermata Radar.** È l'unico numero del progetto che si può ottenere solo stando a una fermata, e finché era una costante ogni tentativo costava un deploy e una seconda uscita in strada. Chi lo cambia **rifaccia la prova**, non lo deduca: il feed nega di avere un ritardo, quindi nessuna lettura dei dati può confermarlo. Il protocollo e l'esito sono in `project-reference.md` §4.

**Il radar cercava intorno a Porta Nuova, non intorno a chi lo apriva.** Da Mirafiori elencava mezzi a chilometri e sembrava non pescare niente. Ora prende la posizione all'apertura se il permesso c'è già (senza aprire il prompt a sorpresa se non c'è), elenca tutti i mezzi invece dei primi quattro, separa i tracciati dalle corse da orario, e mostra anche le paline nel raggio — che prima mancavano del tutto.

### Convenzioni introdotte, da rispettare

- **La funzione di bucket degli orari è duplicata** in `frontend/scripts/stop-schedule.mjs` e `frontend/src/services/stopSchedule.ts`. Se ne cambi una, cambia l'altra: altrimenti una palina chiede il bucket sbagliato e risulta senza corse.
- **Il prompt dei render vive nel catalogo**, non nel workflow. Se un render non va bene si corregge `renderPrompt` in `gttFleetCatalog.ts` e si rigenera; non si ritocca il file, la rigenerazione perderebbe la correzione.
- **I render stanno entro 400 kB e devono essere referenziati.** `npm run verify:assets` fallisce altrimenti.
- **`ASSUMED_UNDECLARED_FEED_DELAY_SECONDS` si cambia solo dopo una prova dalla strada**, mai deducendolo dai dati, e il valore trovato va riportato in `latencyTuning.ts` **e** in `project-reference.md`: altrimenti resta sul telefono di chi l'ha misurato.
- **`MoreScreen` non è collegata a nessuna rotta** e nessuno la può aprire, con dentro il pannello diagnostico realtime. Va collegata o rimossa: lasciarla lì fa credere che quel pannello esista nell'app.
- **`generic-tram` resta senza render di proposito**, e il suo `renderPrompt` è vuoto perché nessuno lo rigeneri per sbaglio. Un tram tracciato di cui non si riconosce la serie non riceve un'immagine: lì arriva l'assenza di un modello, non un modello. Se le matricole che ci finiscono appartengono a una serie reale, si aggiunge la serie in `vehicleFleetRules.ts`. **Da non confondere con `generic-tram-line`**, che risponde a un'altra domanda — che tipo di mezzo usa questa linea — e un'immagine ce l'ha.
- **Le tre chiavi di classe si usano solo sulle corse non accertate.** Non sono vetture: se una finisce su un mezzo tracciato, la scheda dichiara come classe quello che dovrebbe identificare.
- **Un cluster con `referenceAsset` si rigenera con quell'immagine allegata**, mai ridescrivendola a parole: è la differenza fra il tram vero e uno inventato. E si rigenera con un `variant` nuovo, o la cache continua a servire il file vecchio.
- **Un nuovo layer di mezzi va aggiunto anche a `vehicleLayers`** in `BusMap.tsx`, o non risponde a click e hover.
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
- Le sprite dei mezzi sulla mappa (`public/assets/vehicles/*.png`) sono rimaste PNG: circa 660 kB che si potrebbero ridurre come è stato fatto per i render di dettaglio.
