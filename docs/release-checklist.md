# Release Checklist

## Product

- PWA enabled
- guest play enabled
- original branding in place
- ranked and local play modes available

## Quality

- automated tests (`npm test`), including the no-emoji, registered-asset and
  migration-safety suites
- lint checks
- production build
- `npm run qa:probe -- --all-viewports` passes after layout changes
- health endpoint for backend

## Deploying to an existing server

- update with `npm run update:server` (never a bare `git pull` + restart): it
  backs up code, `data/`, an external `DATA_DIR`, `.env` and the Docker volume,
  and takes an integrity-checked SQLite snapshot before touching anything
- check the first log lines: `Data directory: … (from …)` must name the
  directory that holds the live `fractured-arcanum.db`; a "No database found"
  warning on a server with players means `DATA_DIR` is set somewhere the
  updater cannot read — stop and rerun with `DATA_DIR=/path/to/data`
- schema changes apply on start, additively; no manual migration step
- if anything looks wrong, `npm run restore:server` — it moves the current
  data aside as `*.pre-restore-<timestamp>` rather than deleting it

## Device validation

- Current pass: Android Chrome browser mode validates install prompt flow, queue overlays, and battle drag reliability
- Current pass: Android installed PWA validates splash-to-app launch, reward cinema containment, service-worker update handling, and settings/shop subview containment
- Current pass: desktop narrow viewport simulation validates 375px, 390px, 430px, and short-height phone layouts
- Current pass: repeated battle loops validate drag, attack targeting, inspect, Play Again, Leave to Lobby, and result-summary state resets
- Current pass completion gate: no clipped back actions, no horizontal spill, and no unreachable CTA rows on the tested narrow viewports
- Deferred until hardware is available: iPhone Safari long-press inspect stays in-app and no browser context menu escapes
- Deferred until hardware is available: iPhone Home Screen install validates icon, safe-area spacing, top chrome, bottom nav reachability, standalone launch, and update prompts

## Before public launch

- deploy production host
- configure passkey production account environment variables from `docs/AUTH_ACCOUNT_PRODUCTION_PLAN.md`
- verify available real mobile devices against the current-pass device validation checklist above
- complete deferred iPhone Safari and Home Screen Web.app validation before claiming full iOS readiness
- approve Terms of Service, Privacy Policy, and account/contact copy before public account launch; keep legal copy aligned with the no-real-money-purchases product decision
- verify passkey registration, passkey login, legacy account migration, export, deletion, and owner passkey admin access on staging
- replace any remaining placeholder UI with approved final art where desired
