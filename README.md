# BusRadar

BusRadar Mobile MVP v0.1 è una webapp standalone, mobile-first, che simula una vista "FlightRadar dei bus" per Torino.

## Stato del progetto

- Stack: React, Vite, TypeScript, Leaflet, CSS custom.
- Dati: demo locali simulati con integrazione GTFS-RT sperimentale via proxy.
- Backend: Supabase Edge Function solo per proxy realtime pubblico.
- Feed realtime: GTT GTFS-RT via proxy, con fallback simulato.
- Scraping: assente.
- Versione attuale: v0.2 Live Transit Map demo.

## Note legali e dati simulati

BusRadar non è un servizio ufficiale GTT, MaTO, 5T o del Comune di Torino. I dati realtime sono letti in modalità civic-tech/non commerciale tramite proxy tecnico; percorsi demo, fermate demo e statistiche restano dati dimostrativi finche' non sara' completata la validazione GTFS statico/licenza.

Il progetto non effettua scraping, non usa endpoint privati e non include chiavi API nel repository.

## BusRadar v0.2 Live Transit Map

La mappa usa Leaflet con tile cartografici reali per rendere Torino navigabile. I dati transit sono comunque locali e simulati: bus, tram, linee, fermate, velocità, aggiornamenti e percorsi demo non rappresentano servizio reale.

Il layer custom Diorama/landmark è stato rimosso: la demo punta su una base cartografica pulita con mezzi animati, marker bus/tram distinti, bearing di marcia e percorsi demo.

## Realtime roadmap

- Oggi BusRadar puo' usare Vehicle Positions GTFS-RT tramite Supabase Edge Function, con fallback automatico ai dati simulati.
- L'architettura passa da `TransitDataProvider` e da adapter separati.
- `SimulationAdapter` resta il fallback stabile del MVP.
- `GTFSStaticAdapter` e `GTFSRealtimeAdapter` sono placeholder documentati.
- Una futura integrazione GTFS/GTFS-RT va fatta solo con feed autorizzati, verifica tecnica e licenza compatibile.
- La branch `realtime-spike` aggiunge script, env placeholder, proxy Supabase e checklist per validare GTFS statico/GTFS-RT. Vedi `README_REALTIME.md`.

## Sviluppo

```bash
cd frontend
npm install
npm run dev
```

## Build

```bash
cd frontend
npm run build
```

## Deploy GitHub Pages

URL prevista:

```text
https://trailpress.github.io/BusRadar/
```

Comando:

```bash
cd frontend
npm run deploy
```

## Struttura

```text
busradar/
├── docs/
│   └── product-spec-v0.1.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── data/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── styles/
│   │   └── App.tsx
│   └── package.json
└── README.md
```
