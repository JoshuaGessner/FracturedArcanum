# Styles Index — `src/App.css` (2,662 lines)

## CSS Custom Properties (Lines 1–71)
`:root` variables — color palette, design tokens, spacing, typography, semantic colors, animation curves

### Theme Variants (Lines 137–151)
`.theme-ember`, `.theme-moon` — Override ambient background colors

## Section Map

| Section | Lines | Key Classes |
|---------|-------|-------------|
| **Root Variables** | 1–71 | `:root`, custom properties |
| **Layout Primitives** | 73–95 | `.stack-*`, `.row-*`, focus rings |
| **App Shell** | 97–135 | `.app-shell`, ambient gradient, `@keyframes ambientFloat` |
| **Screen Transitions** | 153–180 | `.screen-panel.active`, `@keyframes screenIn` |
| **Navigation** | 182–243 | `.nav-strip`, `.nav-chip` |
| **Topbar & Brand** | 245–296 | `.topbar-art`, `.brand-logo`, `@keyframes logoPulse` |
| **Season Progress** | 298–322 | `.season-progress-block`, `.progress-fill` |
| **Section Cards** | 324–379 | `.section-card`, `.hero-card`, `.eyebrow` |
| **Hero Display** | 381–425 | Hero showcase, battle HUD |
| **Badges & Status** | 427–475 | Badges, difficulty panels, leaderboard |
| **Buttons** | 477–516 | `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.mini` |
| **Battle Topbar** | 518–548 | Battle HUD, hero compacts, resources |
| **Mana/Momentum Pips** | 550–575 | `.pip-row`, filled/momentum states |
| **Enemy Turn Banner** | 577–596 | `.enemy-turn-banner`, `@keyframes banner-pulse` |
| **Board & Lanes** | 598–678 | `.board-grid`, `.slot` states (empty, selected, exhausted, guard), `@keyframes selectPulse` |
| **Rarity Styling** | 680–722 | `.rarity-*` color overrides |
| **Hand Cards** | 724–828 | `.hand-grid`, `.hand-card`, `.cost-pill`, card art |
| **Deck Builder** | 830–889 | `.builder-grid`, `.builder-card`, `.stepper` |
| **Text Styles** | 891–908 | `.note`, `.card-text`, clamped text |
| **Victory/Summary** | 910–932 | Summary cards, quest/log lists |
| **Queue/Modals** | 934–1029 | `.queue-overlay`, `.queue-modal`, `@keyframes modalPop`, `@keyframes spin` |
| **Matchmaking** | 1031–1055 | Queue pills (idle/searching/found) |
| **Vault Themes** | 1057–1093 | Theme grid, swatches (royal/ember/moon) |
| **Forms & Admin** | 1110–1284 | Form stacks, admin panels, role badges, audit log |
| **Presence & Challenge** | 1286–1320 | Presence dots, challenge banner, `@keyframes challenge-pulse` |
| **Card Trading** | 1322–1372 | Trade blocks, trade chips, status badges |
| **Battle Animations** | 1378–1411 | `@keyframes cardPlay`, `damageFlash`, `deathFade`, `legendaryShine` |
| **Responsive** | 1413–1483 | Breakpoints: 900px, 640px, 400px |
| **Auth Gate** | 1485–1558 | Auth modal, form inputs |
| **Card Packs** | 1560–1632 | Pack grid, `@keyframes cardReveal` |
| **Turn HUD** | 1634–1662 | `.turn-bar`, arena title |
| **Card Inspect** | 1664–1727 | Card inspect modal |
| **Connection Status** | 1756–1802 | Reconnection banners, PWA install |
| **Toast System** | 1837–1864 | `.toast` with success/error/warning |
| **Modal System** | 1887–1936 | `.modal-backdrop`, `.modal` |
| **Multi-Deck Roster** | 2020–2080 | `.deck-roster` |
| **Builder Toolbar** | 2082–2134 | Filter chips, search, rarity toggles |
| **Mana Curve** | 2136–2172 | `.mana-curve`, curve bars |
| **Card Borders** | 2174–2209 | `.border-*` cosmetics |
| **Reduced Motion** | 2211–2217 | `prefers-reduced-motion` |

## Keyframe Animations (12)

| Animation | Line | Duration | Purpose |
|-----------|------|----------|---------|
| `ambientFloat` | ~115 | 20s | Background gradient movement |
| `screenIn` | ~165 | 0.3s | Screen slide-in |
| `logoPulse` | ~270 | 2s | Brand logo glow |
| `selectPulse` | ~652 | 1.5s | Selected unit glow |
| `legendaryShine` | ~841 | 3s | Legendary card shimmer |
| `banner-pulse` | ~590 | 2s | Enemy turn banner pulse |
| `modalPop` | ~990 | 0.25s | Modal scale-in |
| `spin` | ~1010 | 0.9s | Loading spinner |
| `cardPlay` | ~1380 | 0.35s | Card play animation |
| `damageFlash` | ~1390 | 0.4s | Damage red flash |
| `deathFade` | ~1400 | 0.4s | Unit death fade |
| `cardReveal` | ~1610 | 0.5s | Pack opening reveal |
| `challenge-pulse` | ~1310 | 2s | Challenge banner pulse |

## Responsive Breakpoints

| Width | Line | Changes |
|-------|------|---------|
| ≤900px | 1413 | Tablet layout adjustments |
| ≤640px | ~1440 | Mobile optimizations |
| ≤400px | ~1470 | Small phone compact |
| `prefers-reduced-motion` | 2211 | Disable animations |
