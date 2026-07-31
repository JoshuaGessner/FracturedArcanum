> **`src/App.css` is now an index, not a stylesheet.** It contains only
> `@import` lines pointing at `src/styles/*.css`, split into 24 modules that are
> contiguous slices of the original 9,550-line file.
>
> **The import order in `App.css` is load-bearing.** The cascade resolves by
> source order and this project relies on it heavily — `responsive.css`
> overrides earlier layout, `production-polish.css` overrides component
> defaults. Reordering the imports changes rendering. Add a new module in the
> position its cascade requires, not alphabetically.
>
> The section map below still describes what lives where; each heading now
> corresponds to a file in `src/styles/`. Line numbers are historical.

# Styles Index — `src/App.css`

<!-- markdownlint-disable MD022 MD032 MD060 -->

## Overview

`src/styles/*.css`, loaded through the `src/App.css` index, contains the
presentation layer:

- one-scene app shell and viewport ownership rules
- per-screen illustrated backdrops
- semantic fantasy chrome for cards, buttons, panels, and dividers
- queue, reward, onboarding, pack ceremony, and battle surfaces
- collection, social, shop, and settings density passes
- gamification, urgency, and celebration effects
- responsive and reduced-motion safeguards at the end of the file

## Major section map

| Section | Approx. Range | Key Classes |
|------|------|
| Root tokens | `:root`, spacing, palette, motion variables |
| App shell and viewport ownership | `.app-shell`, `.scene-stage`, `.screen-panel.active`, shell motion |
| Screen backdrops and transitions | scene `::before` backgrounds, transition classes, nav tile framing |
| Brand, topbar, and season progress | `.topbar-art`, `.brand-logo`, `.season-progress-*`, hero strips |
| Status, badges, buttons, and game chrome | `.badge`, `.deck-status`, `.streak-badge`, `.primary`, `.ghost`, pips |
| Battle HUD, board, hand, and reactions | duel ribbon, board slots, fixed drag ghost layer, drop targets, attack telegraph, hand fan |
| Reward, queue, and ceremony surfaces | vault urgency, pack reveal, battle intro, reward cinema, banners |
| Screen-specific density blocks | play, collection, social, shop, settings, admin surfaces |
| Overlays, tours, and support systems | confirm modal, onboarding, pack ceremony, reward cinema, toast stack |
| Reduced-motion and polish overrides | 4080–end | responsive breakpoints, reduced motion, final shell polish |

## Key visual systems

### Section nav strips
Shop, Settings, and Social each have a persistent section nav strip at the top of their command card. All three use the same canonical button style:
- `border-radius: var(--radius-sm)` (6 px) — never pill (`999px`)
- `background: linear-gradient(135deg, rgba(8,14,30,0.68), rgba(23,31,57,0.54))`
- `font-weight: 800`, `text-transform: uppercase`, `font-size: var(--font-xs)`
- Active state: amber gradient border + amber/blue background tint, `color: #fff7d6`

CSS classes: `.shop-nav-strip button`, `.settings-nav-strip button`, `.social-nav-strip button` — all covered by the same rule block alongside `.settings-admin-nav button`.

### Scene shell
Every primary screen now renders inside a fixed-height shell:

- the app owns the viewport height
- only the active content surface may scroll vertically
- battle keeps vertical scroll minimized while preserving horizontal hand movement
- secondary rails such as decks, themes, borders, and reveals stay horizontal
- non-battle screens should not create nested scroll traps; prefer active `screen-panel` scrolling unless a rail/list is intentionally contained
- mobile scene background pseudo-elements must not expand the scrollable width beyond the viewport

### Viewport QA
Responsive layout work is validated by `npm run qa:viewport`, implemented in `scripts/verify-responsive-layout.mjs`.

The audit starts a temporary Vite server, sweeps phone/tablet/desktop viewport sizes, visits every primary screen plus Social/Shop/Settings subviews, captures screenshots in `.layout-qa/`, and writes `.layout-qa/responsive-layout-report.json`. It fails on document horizontal overflow, clipped visible content, offscreen interactive controls, or battle hand top-control clipping, and reports touch-target warnings separately.

### Chrome strategy
- panels use a single intentional chrome owner instead of nested frames
- action buttons use `btn-primary.svg`, `btn-ghost.svg`, and `btn-danger.svg`
- dividers use `divider-rune.svg`
- mana and momentum are art-backed pips rather than plain circles

### Gamification and ceremony cues
The stylesheet includes:

- streak heat badge states with ember and inferno treatment
- reward urgency pulses and post-claim confirmation
- collection progress rings and rarity completion celebration
- pack reveal glow layers and ceremony motion
- rank-up and reward-cinema framing

## Keyframe animations in active use

| Animation | Purpose |
|-----------|---------|
| `ambientFloat` | Background drift and shell ambience |
| `logoPulse` | Brand logo pulse |
| `fireGlow` | High-streak inferno emphasis |
| `emberFloat` | Streak ember motion |
| `claimCheck` | Daily reward satisfied checkmark |
| `raritySpark` | Collection rarity completion celebration |
| `selectPulse` | Selected unit and targeting emphasis |
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
- `@media (max-width: 640px)` tightens screen chrome, wraps dense nav strips, and avoids inner scroll caps that can hide mobile content
- `@media (max-width: 400px)` further compresses dense card and header surfaces
- `@media (prefers-reduced-motion: reduce)` disables decorative animations and pulse effects while preserving state clarity

## Maintenance notes

- add new styles near the most relevant visual system instead of appending random blocks
- keep reduced-motion overrides at the very end so they win specificity cleanly
- prefer semantic class names tied to screen roles and asset-backed primitives
- battle-state notices should render as floating overlays, not layout-shifting banners
- keep the battle information map consistent: cost and effect at the top of live cards, attack and health at the bottom
- keep battle hand cards inside a padded vertical safe area so cost pips and effect seals are never cropped by hand rail overflow at desktop or mobile heights
- use one shared summary-popup visual grammar for reward recaps, post-battle conclusions, and similar milestone overlays
