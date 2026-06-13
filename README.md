# BusRadar

BusRadar è una webapp standalone, mobile-first, che mostra mezzi GTT su mappa in stile live transit map per Torino.

## Stato del progetto

- Stack: React, Vite, TypeScript, Leaflet, CSS custom.
- Dati: Vehicle Positions GTFS-RT tramite proxy tecnico Supabase; GTFS statico locale generato da zip GTT per linee, shapes e fermate.
- Backend: Supabase Edge Function solo per proxy realtime pubblico.
- Feed realtime: GTT GTFS-RT via proxy.
- Scraping: assente.
- Versione attuale: v0.2 Live Transit Map realtime-ready.

## Note legali

BusRadar non è un servizio ufficiale GTT, MaTO, 5T o del Comune di Torino. I dati realtime sono letti in modalità civic-tech/non commerciale tramite proxy tecnico; l'integrazione resta sperimentale e va validata a livello tecnico e di licenza prima di un uso pubblico stabile.

Il progetto non effettua scraping, non usa endpoint privati e non include chiavi API nel repository.

## BusRadar v0.2 Live Transit Map

La mappa usa Leaflet con tile cartografici reali per rendere Torino navigabile. I mezzi arrivano dal feed Vehicle Positions GTFS-RT, mentre linee, tracciati e fermate sono generati dal GTFS statico locale.

Il layer custom Diorama/landmark è stato rimosso: la versione attuale punta su una base cartografica pulita con mezzi animati, marker bus/tram distinti, bearing di marcia e percorsi GTFS.

## Realtime roadmap

- Oggi BusRadar usa Vehicle Positions GTFS-RT tramite Supabase Edge Function.
- L'architettura passa da `TransitDataProvider` e da adapter separati.
- `SimulationAdapter` resta nel codice come adapter locale di sviluppo, ma non viene usato dalla UI realtime.
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
