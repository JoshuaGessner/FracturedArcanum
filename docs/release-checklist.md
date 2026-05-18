# Release Checklist

## Product

- PWA enabled
- guest play enabled
- original branding in place
- ranked and local play modes available

## Quality

- automated tests
- lint checks
- production build
- health endpoint for backend

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
