# BusRadar

Le istruzioni di questo progetto sono in [`AGENTS.md`](AGENTS.md) e valgono integralmente anche qui: layout, controlli obbligatori prima di una pull request, regole di sicurezza, flusso dei rami e lavoro in tandem tra agenti.

Questo file esiste perché Claude Code carica automaticamente `CLAUDE.md`, mentre Codex carica automaticamente `AGENTS.md`. Senza di esso una sessione Claude Code partirebbe senza le regole del progetto, e le due metà del tandem non lavorerebbero con le stesse istruzioni.

Le regole **non** sono duplicate qui di proposito: due copie divergono, e la copia sbagliata è peggio di nessuna copia. `AGENTS.md` resta l'unica fonte.

## Da leggere all'inizio di ogni sessione

1. [`docs/handoff.md`](docs/handoff.md) — la nota lasciata dall'agente precedente: cosa è già in produzione, cosa è in sospeso, quale ramo non toccare, cosa è rimasto non verificato. Va aggiornata alla fine del proprio turno.
2. [`docs/project-reference.md`](docs/project-reference.md) — com'è fatto il progetto: architettura, flusso dei dati, dove intervenire per tipo di modifica, parametri di taratura, comandi di verifica, incoerenze note.
3. [`AGENTS.md`](AGENTS.md) — le regole operative.
