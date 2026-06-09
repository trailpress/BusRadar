# BusRadar

BusRadar Mobile MVP v0.1 è una webapp standalone, mobile-first, che simula una vista "FlightRadar dei bus" per Torino.

## Stato del progetto

- Stack: React, Vite, TypeScript, Leaflet, CSS custom.
- Dati: solo demo locali e simulati.
- Backend: assente.
- Feed realtime: assenti.
- Scraping: assente.
- Versione attuale: v0.2 Diorama Map.

## Note legali e dati simulati

BusRadar v0.1 non è un servizio ufficiale GTT, MaTO, 5T o del Comune di Torino. I mezzi, le posizioni, gli orari, le velocità, le fermate, i percorsi e le statistiche sono dati simulati per finalità demo.

Il progetto non usa endpoint GTT/MaTO/5T, non effettua scraping e non integra dati realtime non autorizzati.

## BusRadar v0.2 Diorama Map

La mappa usa Leaflet con tile cartografici reali per rendere Torino navigabile. I dati transit sono comunque locali e simulati: bus, linee, fermate, velocità, aggiornamenti e percorsi demo non rappresentano servizio reale.

Il pulsante layer alterna:

- Standard: mappa Leaflet navigabile.
- Diorama: mappa dark con landmark stilizzati CSS/SVG, linee colorate, fermate e bus demo in movimento.

Il layer Diorama non usa immagini pesanti o modelli 3D. I landmark sono elementi CSS/SVG leggeri su coordinate demo.

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
