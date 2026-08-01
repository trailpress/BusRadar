# Flusso cloud di BusRadar

GitHub e' la fonte ufficiale del progetto. Il Mac non e' necessario per modificare, verificare o pubblicare BusRadar.

La sola versione definitiva e' il contenuto del ramo `main` su GitHub. Le cartelle sul Mac e i workspace Codex sono copie di lavoro sostituibili; l'iPhone non conserva una copia del repository e serve solo per controllare Codex Cloud, pull request e Actions. Un ramo `codex/*` non e' definitivo finche' non viene verificato e unito in `main`.

## Flusso ordinario

1. Aprire Codex Cloud da qualsiasi dispositivo.
2. Selezionare il repository `trailpress/BusRadar` e il ramo `main`.
3. Descrivere la modifica richiesta.
4. Lasciare che Codex crei un ramo `codex/*`, esegua i controlli e apra una pull request.
5. Verificare il riepilogo e il risultato di `Verify BusRadar`.
6. Unire la pull request in `main`.
7. GitHub Actions costruisce e pubblica automaticamente il sito.

## Ambiente Codex Cloud

Configurazione consigliata:

- repository: `trailpress/BusRadar`;
- ramo iniziale: `main`;
- versione Node.js: 22;
- setup: `cd frontend && npm ci`;
- controlli: `cd frontend && npm run verify:assets && npm run verify:routes && npm run build`;
- nessun secret richiesto per la normale build della webapp.

Le attivita' che modificano Supabase o altri servizi esterni devono usare credenziali protette nel servizio appropriato. Le chiavi non vanno inserite nei messaggi, nei file o nel bundle pubblico.

## Alternativa browser

Il repository include `.devcontainer/devcontainer.json`. GitHub Codespaces puo' quindi creare un ambiente browser gia' configurato e installare automaticamente le dipendenze.

## Copia facoltativa sul Mac

Il Mac e' solo una replica. Quando viene acceso, la copia esistente puo' essere aggiornata da GitHub:

```bash
git switch main
git pull --ff-only origin main
```

Se la copia locale viene eliminata, il progetto puo' essere ricreato in qualunque momento:

```bash
git clone https://github.com/trailpress/BusRadar.git
```

La disponibilita' del sito e delle modifiche cloud non dipende dallo stato del Mac.

## Allineare una copia locale esistente

Prima di iniziare un nuovo intervento sul Mac, conservare eventuali modifiche locali e riallineare la copia con `main`:

```bash
cd /percorso/di/BusRadar
git status
git fetch --prune origin
git switch main
git pull --ff-only origin main
```

Se `git status` mostra file modificati, non eseguire reset distruttivi: creare prima un ramo di salvataggio con `git switch -c codex/salvataggio-locale` e committare le modifiche. Ogni nuovo intervento deve partire da `main` aggiornato:

```bash
git switch -c codex/nome-breve-intervento
```

Al termine, pubblicare il ramo e aprire una pull request verso `main`:

```bash
git push -u origin HEAD
```

Dopo il merge, tornare su `main`, eseguire `git pull --ff-only origin main` ed eliminare soltanto i rami locali già integrati.

## Lavorare da iPhone

Da iPhone, usare Codex Cloud collegato al repository `trailpress/BusRadar` e avviare ogni attività da `main`. Codex deve creare un ramo `codex/*`, eseguire i controlli richiesti e aprire una pull request. Nell'app GitHub o in Safari si possono poi controllare la pull request e l'esito di `Verify BusRadar`; il merge in `main` avvia automaticamente il deploy GitHub Pages.

I workflow manuali si avviano dalla scheda **Actions**, selezionando il workflow e poi **Run workflow**. Un workflow nuovo compare nell'elenco solo dopo che il relativo file YAML è stato pubblicato su GitHub. Non inserire mai token o chiavi nei messaggi: i valori riservati devono rimanere nei repository o environment secrets.
