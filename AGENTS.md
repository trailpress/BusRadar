# BusRadar agent instructions

## Project layout

- The application is in `frontend/`.
- The production site is built with React, TypeScript and Vite.
- Static public assets are in `frontend/public/`.
- GitHub Pages publishes `frontend/dist/` at `/BusRadar/`.
- Supabase Edge Functions provide runtime configuration and the GTT realtime proxy.

## Required checks

Run these commands from `frontend/` before proposing a pull request:

```bash
npm ci
npm run verify:assets
npm run verify:routes
npm run build
```

For interface changes, also run the development server and verify the affected desktop and mobile views.

## Repository workflow

- `main` is the source of truth and the only production deployment branch.
- Create a short-lived working branch for changes, prefixed with the name of the agent that opens it: `codex/*` for Codex, `claude/*` for Claude Code.
- Submit changes through a pull request and wait for `Verify BusRadar` to pass.
- Do not edit or push generated files directly to `gh-pages`.
- Merging into `main` triggers the GitHub Pages deployment automatically.

## Multiple agents

More than one agent works on this repository, in alternation rather than at the same time. `main` is the only handoff point between them.

- Always start a new task from an up-to-date `main`, never from another agent's branch.
- Read the recent history of `main` before planning a change, so that work already merged by another agent is not repeated or reverted.
- Do not commit to, rebase or force-push a branch opened by another agent. If its pull request is still open and needs changes, say so and let the agent that owns it finish, or start a fresh branch from `main`.
- Once a pull request is merged, its branch is finished. Follow-up work needs a new branch cut from the updated `main`.
- Keep each pull request small enough to be reviewed and merged in one sitting. Long-lived branches are what makes parallel work conflict.
- Record durable decisions in `AGENTS.md` or `docs/`, not only in a pull request description, because the next agent starts without the previous conversation.

## Security

- Never commit API keys, access tokens, passwords, private feed URLs or `.env` files.
- Do not place private values in `VITE_*` variables because they are visible in the browser bundle.
- Keep Google, Mapillary and other route-preview credentials in Supabase Edge Function secrets.
- Keep deployment-only credentials in GitHub environment or repository secrets.
- Use `frontend/.env.example` only for empty placeholders and public configuration.

## Change scope

- Preserve existing project patterns and keep changes focused.
- Do not replace verified GTFS route geometry with invented coordinates.
- Do not replace fleet renders without checking the model, series and livery against reliable references.
- Treat the Mac checkout as an optional mirror. The repository and cloud workflows must remain sufficient to build and deploy the project.
