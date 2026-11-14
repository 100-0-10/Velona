# Velona repository guidance

## Structure

- `frontend/`: React, TypeScript, Vite, Three.js browser client.
- `backend/`: .NET 10 authoritative server and meaningful server tests.
- `docs/design/data/`: versioned design catalogs; most content is planned, not implemented.
- `docs/development/`: current implementation contract and known limitations.
- `.github/workflows/ci.yml`: data, frontend, backend and browser verification.

## Boundaries

- Keep player-facing text Korean and the canonical project name Velona.
- Treat the server as owner of movement bounds, combat, rewards, inventory and jobs.
- Do not trust client positions, quantities, identities or completion timestamps.
- Do not put secrets in the frontend or commit local runtime/generated files.
- Do not silently change the planning JSON to speed up a prototype; use an explicit runtime configuration and document differences.
- Test hooks must be development-gated and read-only; do not add resource grants or server mutation backdoors for screenshots.
- Initial guest identity is local development scaffolding. PostgreSQL checkpoint persistence is enabled by default; never silently fall back to memory when configured storage fails. Do not describe this as a deployable production service or claim a measured30-player capacity.
- External graphics and audio assets require recorded source/use rights; procedural art in this first slice is a prototype.

## Validation

From the repository root run `node scripts/validate-design.mjs` and `dotnet test backend/Velona.slnx --configuration Release` for relevant data/server changes. From `frontend/` run `npm run test:unit` and `npm run build`. For changes spanning input, networking, rendering or gameplay run `npm run test:e2e` after installing Playwright Chromium.

Prefer tests for real ownership, reconnection, bounded inputs, duplicate requests and inventory transitions. Do not add tests that only mirror constants or internal implementation.

Update the current development guide when changing wire contracts or prototype limitations. Preserve historical planning documents as baseline references and make current status explicit.
