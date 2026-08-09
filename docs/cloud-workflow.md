# Flusso cloud di BusRadar

GitHub e' la fonte ufficiale del progetto. Il Mac non e' necessario per modificare, verificare o pubblicare BusRadar.

La sola versione definitiva e' il contenuto del ramo `main` su GitHub. Le cartelle sul Mac e i workspace degli agenti cloud sono copie di lavoro sostituibili; l'iPhone non conserva una copia del repository e serve solo per controllare gli agenti, le pull request e le Actions. Un ramo di lavoro non e' definitivo finche' non viene verificato e unito in `main`.

## Flusso ordinario

1. Aprire un agente cloud (Codex Cloud o Claude Code sul web) da qualsiasi dispositivo.
2. Selezionare il repository `trailpress/BusRadar` e il ramo `main`.
3. Descrivere la modifica richiesta.
4. Lasciare che l'agente crei un ramo di lavoro (`codex/*` oppure `claude/*`), esegua i controlli e apra una pull request.
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

## Lavorare in tandem con Codex e Claude Code

Sul progetto lavorano due agenti cloud, in alternanza e non contemporaneamente. Entrambi leggono `AGENTS.md` all'avvio, quindi seguono gli stessi controlli e le stesse regole di sicurezza.

Il punto di consegna tra i due è sempre `main`: chi riprende il lavoro parte da `main` aggiornato e trova lì tutto quello che l'altro ha già unito. Non serve spiegare a mano cosa è stato fatto, basta che ogni intervento passi da una pull request.

Regole pratiche:

- Un solo agente per volta su una stessa area di codice.
- Ogni agente apre rami con il proprio prefisso: `codex/*` per Codex, `claude/*` per Claude Code. Il prefisso rende evidente in `git log` e nella lista dei rami chi ha fatto cosa.
- Un agente non commita, non fa rebase e non forza il push su un ramo aperto dall'altro. Se una pull request altrui va corretta, la finisce chi l'ha aperta oppure si parte da un ramo nuovo su `main`.
- Prima di iniziare, chiudere o unire le pull request rimaste aperte. Rami di lunga durata in parallelo sono la causa principale dei conflitti.
- Le decisioni che devono sopravvivere alla sessione vanno scritte in `AGENTS.md` o in `docs/`, non solo nel testo della pull request: l'altro agente non vede la conversazione precedente.

Se una pull request resta aperta quando si cambia agente, il modo più semplice per riprendere è unirla in `main` dopo il verde di `Verify BusRadar` e ripartire da lì.

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

Da iPhone si lavora solo attraverso agenti cloud e interfaccia web: nessuna copia del repository viene tenuta sul telefono.

Sono disponibili due strade, intercambiabili perché passano entrambe da `main` e dalla stessa pull request:

- **Codex Cloud**, collegato al repository `trailpress/BusRadar`.
- **Claude Code sul web** (`claude.ai/code`), da Safari o dall'app Claude, collegato allo stesso repository. La sessione gira in un contenitore remoto che clona il repository, esegue i controlli e apre la pull request; il telefono serve solo a dare istruzioni e leggere i risultati.

In entrambi i casi si avvia ogni attività da `main`, l'agente crea un ramo di lavoro con il proprio prefisso, esegue i controlli richiesti e apre una pull request. Nell'app GitHub o in Safari si possono poi controllare la pull request e l'esito di `Verify BusRadar`; il merge in `main` avvia automaticamente il deploy GitHub Pages.

Il lavoro da iPhone non richiede né il Mac acceso né un ambiente locale: build, verifiche e pubblicazione avvengono su GitHub Actions.

I workflow manuali si avviano dalla scheda **Actions**, selezionando il workflow e poi **Run workflow**. Un workflow nuovo compare nell'elenco solo dopo che il relativo file YAML è stato pubblicato su GitHub. Non inserire mai token o chiavi nei messaggi: i valori riservati devono rimanere nei repository o environment secrets.
