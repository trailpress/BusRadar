# BusRadar

BusRadar è una webapp standalone, mobile-first, che mostra mezzi GTT su mappa in stile live transit map per Torino.

## Stato del progetto

- Stack: React, Vite, TypeScript, MapLibre GL, CSS custom.
- Dati: Vehicle Positions GTFS-RT tramite proxy tecnico Supabase; GTFS statico locale generato da zip GTT per linee, shapes e fermate.
- Backend: Supabase Edge Function solo per proxy realtime pubblico.
- Feed realtime: GTT GTFS-RT via proxy.
- Scraping: assente.
- Versione attuale: v0.2.31.

## Note legali

BusRadar non è un servizio ufficiale GTT, MaTO, 5T o del Comune di Torino. I dati realtime sono letti in modalità civic-tech/non commerciale tramite proxy tecnico; l'integrazione resta sperimentale e va validata a livello tecnico e di licenza prima di un uso pubblico stabile.

Il progetto non effettua scraping, non usa endpoint privati e non include chiavi API nel repository.

## BusRadar v0.2 Live Transit Map

La mappa usa MapLibre con tile cartografici reali per rendere Torino navigabile. I mezzi arrivano dal feed Vehicle Positions GTFS-RT, mentre linee, tracciati e fermate sono generati dal GTFS statico locale.

La rete GTFS statica viene pubblicata come asset JSON separato e caricata dopo il primo rendering. In questo modo la mappa e l’interfaccia iniziale non devono più analizzare l’intero dataset dentro il bundle JavaScript principale.

Il layer custom Diorama/landmark è stato rimosso: la versione attuale punta su una base cartografica pulita con mezzi animati, marker bus/tram distinti, bearing di marcia e percorsi GTFS.

## Realtime roadmap

- Oggi BusRadar usa Vehicle Positions GTFS-RT tramite Supabase Edge Function.
- L'architettura passa da `TransitDataProvider` e da adapter separati.
- `SimulationAdapter` resta nel codice come adapter locale di sviluppo, ma non viene usato dalla UI realtime.
- `GTFSStaticAdapter` e `GTFSRealtimeAdapter` sono placeholder documentati.
- Una futura integrazione GTFS/GTFS-RT va fatta solo con feed autorizzati, verifica tecnica e licenza compatibile.
- Gli strumenti realtime includono script, placeholder ambiente, proxy Supabase e checklist per validare GTFS statico/GTFS-RT. Vedi `README_REALTIME.md`.

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

## Verifiche locali

```bash
cd frontend
npm run verify:assets
```

La verifica controlla che i cataloghi dati non puntino ad asset mancanti in `public/assets`.

## Sviluppo cloud

GitHub e' la fonte ufficiale del progetto. Codex Cloud, Claude Code sul web o GitHub Codespaces possono aprire, modificare e verificare il repository senza utilizzare il Mac.

Gli agenti cloud lavorano in alternanza sullo stesso repository e si passano il lavoro attraverso `main`: le regole comuni sono in [`AGENTS.md`](AGENTS.md) e in [`docs/cloud-workflow.md`](docs/cloud-workflow.md).

Il punto di partenza per capire com'e' fatto il progetto e in che stato si trova e' [`docs/project-reference.md`](docs/project-reference.md).

Il flusso completo e la configurazione dell'ambiente sono descritti in [`docs/cloud-workflow.md`](docs/cloud-workflow.md).

Il repository contiene inoltre:

- `AGENTS.md`, con istruzioni persistenti per gli agenti cloud;
- `.devcontainer/devcontainer.json`, per un workspace GitHub Codespaces riproducibile;
- `.github/workflows/ci.yml`, per controllare ogni pull request;
- `.github/workflows/deploy-pages.yml`, per pubblicare automaticamente da `main`.

## Deploy GitHub Pages

URL prevista:

```text
https://trailpress.github.io/BusRadar/
```

La pubblicazione e' automatica: ogni modifica unita in `main` viene verificata, compilata e distribuita da GitHub Actions. Il comando locale `npm run deploy` resta disponibile solo come procedura di emergenza e non fa parte del flusso ordinario.

Le chiavi private non sono necessarie alla build e non devono essere aggiunte al repository. La configurazione della vista strada continua a essere fornita a runtime dalla funzione Supabase dedicata.

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
