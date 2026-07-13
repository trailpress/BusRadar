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
- Create a short-lived `codex/*` branch for changes.
- Submit changes through a pull request and wait for `Verify BusRadar` to pass.
- Do not edit or push generated files directly to `gh-pages`.
- Merging into `main` triggers the GitHub Pages deployment automatically.

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
