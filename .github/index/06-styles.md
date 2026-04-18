# Styles Index — `src/App.css` (3,819 lines)

## Overview

`src/App.css` now contains the full Phase 3 presentation layer:

- per-screen illustrated backdrops
- semantic fantasy chrome for cards, buttons, panels, and dividers
- queue, reward, and battle ceremony surfaces
- collection, social, shop, and settings redesign blocks
- gamification and urgency effects
- responsive and reduced-motion safeguards at the end of the file

## Major section map

| Section | Approx. Range | Key Classes |
|---------|---------------|-------------|
| Root tokens | 1–90 | `:root`, spacing, palette, motion variables |
| App shell and ambient backdrop | 90–180 | `.app-shell`, ambient gradients, shell motion |
| Screen transitions | 180–250 | `.screen-panel.active`, forward, back, lateral, battle entry classes |
| Screen backdrops | 180–260 | `.home-screen.active::before` through `.battlefield.active::before` |
| Navigation and nav tiles | 260–380 | `.bottom-nav`, `.nav-chip`, `.nav-tile-*`, urgency notice dot |
| Brand and topbar | 380–460 | `.topbar-art`, `.brand-logo`, `.top-action-toggle` |
| Season and hero presentation | 460–560 | `.season-progress-*`, `.profile-showcase`, `.battle-objective` |
| Badges, status, and gamified strips | 560–720 | `.badge`, `.deck-status`, `.streak-badge`, leaderboard rows |
| Buttons and action chrome | 720–820 | `.primary`, `.secondary`, `.ghost`, `.btn-danger` |
| Battle HUD and arena status | 820–980 | `.battle-topbar`, `.battle-command-dais`, `.battle-status-strip` |
| Pips and enemy-turn banner | 980–1110 | `.pip-*`, `.enemy-turn-banner-*` |
| Board, slots, rarity, effects | 1110–1400 | `.board-grid`, `.slot`, `.rarity-*`, `.effect-badge` |
| Hand fan and card presentation | 1280–1500 | `.hand-fan-stage`, `.hand-fan-grid`, `.hand-card`, overlays |
| Summary and reward surfaces | 1500–1700 | `.summary-card`, `.reward-summary-grid`, `.season-framing` |
| Queue, battle intro, reward overlays | 1700–1960 | `.queue-overlay`, `.intro-modal`, `.reward-modal`, VS art |
| Play, collection, shop, settings chrome | 1960–3200 | mode cards, collection ring, pack reveal, settings desk, admin console |
| Modal and support systems | 2860–3045 | confirmation modal, trade chips, audit expansion |
| Responsive overrides | 3045–end | tablet, mobile, small phone, reduced motion |

## Key visual systems

### Screen backgrounds
Every main screen uses a dedicated generated SVG background wired through a scoped `::before` rule:

- home
- play
- collection
- social
- shop
- settings
- battle

### Chrome strategy
- panels use `panel-frame.svg`
- action buttons use `btn-primary.svg`, `btn-ghost.svg`, and `btn-danger.svg`
- dividers use `divider-rune.svg`
- mana and momentum are art-backed pips rather than plain circles

### Gamification and reward cues
The stylesheet now includes:

- streak heat badge states
- reward urgency pulses
- collection progress rings
- pack reveal glow layers
- victory summary tiles
- battle intro and reward ceremony framing

## Keyframe animations in active use

| Animation | Purpose |
|-----------|---------|
| `ambientFloat` | Background drift and shell ambience |
| `logoPulse` | Brand logo pulse |
| `banner-pulse` | Enemy-turn banner emphasis |
| `selectPulse` | Selected unit targeting emphasis |
| `cardPlay` | Card and slot entrance motion |
| `damageFlash` | Damage feedback on impacted units |
| `deathFade` | Unit death dissolve |
| `legendaryShine` | Legendary rarity shimmer |
| `modalPop` | Overlay and modal entry |
| `spin` | Queue and loading spinners |
| `vsSlam` | Battle intro VS impact |
| `challenge-pulse` | Live challenge banner urgency |
| `urgencyPulse` | Daily reward and alert emphasis |
| `rewardSweep` | Streak and reward shimmer motion |

## Responsive and motion policy

- `@media (max-width: 900px)` stacks multi-column layouts into single-column reading order
- `@media (max-width: 640px)` tightens battle, shop, and form spacing for touch comfort
- `@media (max-width: 400px)` further compresses dense card and header surfaces
- `@media (prefers-reduced-motion: reduce)` disables decorative animations and pulse effects while preserving state clarity

## Maintenance notes

- add new styles near the most relevant visual system instead of appending random blocks
- keep reduced-motion overrides at the very end so they win specificity cleanly
- prefer semantic class names tied to screen roles and asset-backed primitives
