# BusRadar realtime-spike

Branch: `realtime-spike`

Scopo: preparare BusRadar per test GTFS/GTFS-RT autorizzati senza modificare la UI principale e senza sostituire la simulazione locale.

## Stato attuale

- L'app continua a usare `SimulationAdapter`.
- `TransitDataProvider` non attiva feed reali.
- Nessun endpoint reale e nessuna chiave API sono hardcoded.
- Nessuno scraping.
- I percorsi demo restano attivi finche' non viene importato e validato un GTFS statico autorizzato.

## Feed necessari

Per avere linee sulle vie reali serve prima un feed GTFS statico autorizzato:

- `routes.txt`: linee e `route_id`.
- `trips.txt`: associazione tra `route_id`, `trip_id` e `shape_id`.
- `shapes.txt`: geometrie reali dei percorsi, da usare per disegnare le linee sulla mappa.
- `stops.txt`: coordinate fermate.
- `stop_times.txt`: sequenza fermate per viaggio.
- `calendar.txt` / `calendar_dates.txt`: validita' servizio.
- `agency.txt` e `feed_info.txt`: attribution, publisher, periodo e licenza.

Per il realtime servono feed GTFS-RT autorizzati, idealmente separati:

- Vehicle Positions: posizione dei mezzi.
- Trip Updates: ritardi, previsioni e aggiornamenti sulle fermate.
- Alerts: avvisi di servizio, deviazioni, soppressioni, interruzioni.

## Variabili ambiente placeholder

Vedi `frontend/.env.example`.

```bash
GTFS_STATIC_DIR=
GTFS_RT_VEHICLE_POSITIONS_URL=
GTFS_RT_TRIP_UPDATES_URL=
GTFS_RT_ALERTS_URL=
GTFS_RT_API_KEY=
VITE_TRANSIT_DATA_MODE=simulation
VITE_GTFS_RT_VEHICLE_POSITIONS_URL=
VITE_GTFS_RT_TRIP_UPDATES_URL=
VITE_GTFS_RT_ALERTS_URL=
```

`VITE_TRANSIT_DATA_MODE` resta `simulation` finche' il test legale/tecnico non e' completato.

Le variabili `VITE_GTFS_RT_*` sono visibili nel bundle browser: usarle solo per feed pubblici, autorizzati e compatibili CORS. Non inserire token o chiavi private in variabili `VITE_*`.

## Script spike

Lo script puo' lavorare in due modalita':

- GTFS statico locale gia' scaricato/estratto e autorizzato;
- GTFS-RT remoto autorizzato, letto solo da script tramite variabili ambiente.

L'uso previsto per il test live e' non commerciale/civic tech, limitato alla verifica tecnica. Prima di qualunque uso pubblico o continuativo vanno verificati licenza, attribution, rate limit e autorizzazione del feed owner.

```bash
cd frontend
GTFS_STATIC_DIR=/path/al/gtfs-estratto npm run realtime:spike
```

Per generare un modulo TypeScript con shape reali non attivo nella UI:

```bash
cd frontend
GTFS_STATIC_DIR=/path/al/gtfs-estratto npm run realtime:spike -- --write-shapes
```

Output previsto:

- riepilogo agency;
- conteggio tabelle;
- shape rappresentativa per ogni linea BusRadar;
- eventuale `src/data/gtfsRouteShapes.generated.ts`.

### Test GTFS-RT live da script

Impostare solo le variabili disponibili e autorizzate:

```bash
cd frontend
GTFS_RT_VEHICLE_POSITIONS_URL="https://feed-autorizzato.example/vehicle-positions.pb" \
GTFS_RT_TRIP_UPDATES_URL="https://feed-autorizzato.example/trip-updates.pb" \
GTFS_RT_ALERTS_URL="https://feed-autorizzato.example/alerts.pb" \
GTFS_RT_API_KEY="eventuale-token-autorizzato" \
npm run realtime:spike
```

Se il feed non richiede token, lasciare `GTFS_RT_API_KEY` vuota.

Lo script:

- scarica i feed configurati;
- decodifica protobuf GTFS-RT con `gtfs-realtime-bindings`;
- stampa stato HTTP/protobuf;
- stampa numero entita';
- per Vehicle Positions stampa i primi 10 mezzi con `routeId`, `vehicleId`, `tripId`, `lat`, `lon`, `timestamp`;
- gestisce feed vuoti, errori HTTP, errori di rete e decoding non valido.

Gli URL non sono hardcoded nella UI e non vengono salvati nel repository.

## Vista realtime nell'app

La schermata `Altro` include un pannello "Realtime GTFS-RT" che prova a leggere i feed configurati in build tramite:

- `VITE_GTFS_RT_VEHICLE_POSITIONS_URL`
- `VITE_GTFS_RT_TRIP_UPDATES_URL`
- `VITE_GTFS_RT_ALERTS_URL`

Se gli URL non sono configurati, il pannello mostra `Non configurato`. Se un endpoint blocca il browser via CORS o richiede chiavi private, il pannello mostra errore rete/CORS. In quel caso il test reale va fatto con lo script server-side `npm run realtime:spike`, non dalla UI.

La mappa e i mezzi dell'app continuano a usare dati simulati: il pannello realtime e' solo diagnostico.

Per test rapidi da GitHub Pages senza rebuild si possono usare query param con endpoint pubblici/autorizzati e CORS-safe:

```text
https://trailpress.github.io/BusRadar/?gtfsVp=https%3A%2F%2Fexample.org%2Fvehicle.pb
```

Parametri supportati:

- `gtfsVp`: Vehicle Positions.
- `gtfsTu`: Trip Updates.
- `gtfsAlerts`: Alerts.

Non mettere token, API key o endpoint privati nei query param.

Il file generato non deve essere collegato alla UI finche':

- licenza e attribution sono approvate;
- shape e fermate sono validate;
- performance mobile e dimensione bundle sono misurate;
- route mapping e direzioni sono corretti.

## Parsing GTFS-RT previsto

`frontend/src/services/adapters/GTFSRealtimeAdapter.ts` contiene parser difensivi per `FeedMessage` gia' decodificati:

- `parseVehiclePositions(feed)`
  - legge `entity.vehicle`;
  - estrae `vehicle.id`, `trip.trip_id`, `trip.route_id`, lat/lon, bearing, speed, timestamp;
  - normalizza in `RealtimeVehiclePosition`.

- `parseTripUpdates(feed)`
  - legge `entity.trip_update`;
  - estrae trip, route, vehicle e stop time updates;
  - normalizza ritardi e tempi in `RealtimeTripUpdate`.

- `parseAlerts(feed)`
  - legge `entity.alert`;
  - estrae periodi attivi, route/stop coinvolti, causa, effetto, severita' e testi;
  - normalizza in `RealtimeAlert`.

La decodifica protobuf e il fetch HTTP sono implementati solo nello script `frontend/scripts/realtime-spike.mjs`, non nella UI. L'app principale resta su `SimulationAdapter`.

## Checklist tecnica

- [ ] Identificare feed owner e canale ufficiale di accesso.
- [ ] Verificare licenza, limiti di uso, attribution e caching.
- [ ] Scaricare GTFS statico autorizzato in ambiente locale.
- [ ] Validare GTFS con validator esterno prima dell'import.
- [ ] Eseguire `npm run realtime:spike`.
- [ ] Controllare che `shapes.txt` sia presente e coerente con `trips.txt`.
- [ ] Mappare `route_short_name` BusRadar a `route_id`/`shape_id`.
- [ ] Verificare direzioni, duplicati e shape alternative.
- [ ] Misurare dimensione del file shape generato.
- [ ] Definire strategia di semplificazione geometrie per mobile.
- [ ] Decidere se servire shape come asset statico o via adapter.
- [x] Aggiungere decoder protobuf GTFS-RT solo in script separato.
- [ ] Testare Vehicle Positions con fixture locale prima del feed live.
- [ ] Testare Trip Updates e Alerts con fixture locale.
- [ ] Testare Vehicle Positions con endpoint autorizzato da env.
- [ ] Testare Trip Updates con endpoint autorizzato da env.
- [ ] Testare Alerts con endpoint autorizzato da env.
- [ ] Aggiungere fallback automatico a SimulationAdapter.

## Checklist legale

- [ ] Feed pubblicato da fonte ufficiale o con autorizzazione scritta.
- [ ] Licenza compatibile con visualizzazione pubblica.
- [ ] Attribution richiesta inserita in app e README.
- [ ] Nessuna chiamata a endpoint non documentati.
- [ ] Nessuno scraping.
- [ ] Nessuna chiave API nel repository.
- [ ] Rate limit e caching rispettati.
- [ ] Uso live confermato come non commerciale/civic tech o coperto da licenza esplicita.
- [ ] Conferma che BusRadar non appaia come app ufficiale GTT/5T/MaTO.

## Decisione sui tracciati reali

I tracciati corretti non vanno disegnati manualmente. La fonte tecnica corretta e' `shapes.txt` del GTFS statico: contiene punti ordinati per `shape_id` e permette di disegnare il percorso sulle vie reali.

Questa branch prepara l'import. L'attivazione nella UI va fatta in una iterazione successiva, dopo verifica di feed, licenza e qualita' dei dati.
