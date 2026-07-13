# Flusso cloud di BusRadar

GitHub e' la fonte ufficiale del progetto. Il Mac non e' necessario per modificare, verificare o pubblicare BusRadar.

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
