# BusRadar

BusRadar Mobile MVP v0.1 è una webapp standalone, mobile-first, che simula una vista "FlightRadar dei bus" per Torino.

## Stato del progetto

- Stack: React, Vite, TypeScript, Leaflet, CSS custom.
- Dati: solo demo locali e simulati.
- Backend: assente.
- Feed realtime: assenti.
- Scraping: assente.
- Versione attuale: v0.2 Live Transit Map demo.

## Note legali e dati simulati

BusRadar v0.1 non è un servizio ufficiale GTT, MaTO, 5T o del Comune di Torino. I mezzi, le posizioni, gli orari, le velocità, le fermate, i percorsi e le statistiche sono dati simulati per finalità demo.

Il progetto non usa endpoint GTT/MaTO/5T, non effettua scraping e non integra dati realtime non autorizzati.

## BusRadar v0.2 Live Transit Map

La mappa usa Leaflet con tile cartografici reali per rendere Torino navigabile. I dati transit sono comunque locali e simulati: bus, tram, linee, fermate, velocità, aggiornamenti e percorsi demo non rappresentano servizio reale.

Il layer custom Diorama/landmark è stato rimosso: la demo punta su una base cartografica pulita con mezzi animati, marker bus/tram distinti, bearing di marcia e percorsi demo.

## Realtime roadmap

- Oggi BusRadar usa solo dati locali simulati.
- L'architettura passa da `TransitDataProvider` e da adapter separati.
- `SimulationAdapter` è l'unico adapter attivo nel MVP.
- `GTFSStaticAdapter` e `GTFSRealtimeAdapter` sono placeholder documentati.
- Una futura integrazione GTFS/GTFS-RT va fatta solo con feed autorizzati, verifica tecnica e licenza compatibile.
- Nessun endpoint GTT/MaTO/5T, scraping, chiave API o feed realtime non autorizzato è implementato.
- La branch `realtime-spike` aggiunge script, env placeholder e checklist per validare GTFS statico/GTFS-RT senza attivare dati reali nell'app. Vedi `README_REALTIME.md`.

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
