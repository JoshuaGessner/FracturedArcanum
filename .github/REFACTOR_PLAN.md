# Fractured Arcanum — Unified Scene-First Refactor Plan

> Updated 2026-04-19.
> This file replaces older planning notes that no longer match the current direction.
> The active goal is a unified, scene-based game presentation with floating animated elements, board-first battle play, cleaner reward flows, touch-safe interactions, and a clearer progress tracker.

---

## 1. North Star

Fractured Arcanum should feel like a living fantasy card game, not a stack of web pages.

### Core direction
- every primary screen is a **scene**, not a long page of cards
- the app uses **layered visual composition**: backdrop, ambient FX, anchored gameplay/UI, overlays
- intentional overlap and z-layering are allowed when they save space **without blocking interaction**
- battle is **board-first and always playable** on a phone viewport
- floating animated elements should feel intentional and never block interaction
- visuals can be inspired by premium digital card battlers, but all art, layout details, and assets must remain **original**

### Non-negotiables
- no broken or blocked battle interactions
- no stacked framed slabs fighting for the same space
- no redundant combat copy or labels covering the playable card area
- live cards must expose their effect icons without requiring inspect-first play
- no browser-default looking controls in production UI
- no visual direction that depends on copyrighted assets or copied board layouts

---

## 2. Current Problem Summary

The latest battle regression confirms the current UI shell is still built around a **section-card page model**.
That model conflicts with the new direction.

### Root issues
1. **Section-first layout:** screens are still composed like dashboard pages instead of playable scenes.
2. **Overlay conflicts:** floating HUD pieces are being layered onto normal document flow instead of a scene system.
3. **Battle not playable enough:** the board, hand, controls, and hero info are competing for the same mobile space.
4. **Visual inconsistency:** some surfaces now behave like game UI while others still behave like website panels.

### What this means
We should stop patching isolated battle sections and instead refactor the app around a **unified scene shell** that supports:
- anchored floating elements
- ambient animation
- consistent chrome
- gameplay-safe overlays
- one cohesive visual language across all screens

### Recently resolved hardening issues
- battle victory resolution is now screen-scoped so the cinematic flow does not reappear later on unrelated screens
- pack-opening recap now uses pack-specific copy and iconography instead of battle-victory framing
- overlay card-reveal experiences now opt out of scene routing so horizontal reveal browsing stays local to the active flow
- shop and settings subviews now use mobile-safe containment rules so back controls and primary content remain reachable
- inspectable card art now suppresses native drag/callout behavior more consistently so iPhone long press stays inside the in-app inspect flow
- the app now exposes an iPhone-specific Add to Home Screen guidance path instead of treating install as permanently unavailable on Safari

### Current remaining focus
- continue on-device validation for touch targets, drag reliability, and subview containment on narrow phones
- verify the iPhone long-press suppression and Add to Home Screen flow on real Safari / Web.app hardware
- confirm the latest narrow-phone fixes for shop overflow rails and the compact play gate on real hardware

### Newly confirmed platform hardening issues
- some inspectable card surfaces still trigger the iOS Safari image/context callout during long-press instead of staying inside the app’s own inspect flow
- the current install affordance depends on the `beforeinstallprompt` browser event, which is not supported on iPhone Safari, so the app appears permanently unavailable for installation there even when the manifest and icons exist

### Research findings and logged fixes

#### Long-press inspect / context-menu issue
**Observed behavior:** a long press that should open card inspect can still surface the browser’s native context menu or image callout on some devices.

**Likely root cause:** the app already blocks `contextmenu` on the long-press wrapper in `getLongPressProps()`, but Safari can still show native callouts from nested images and other inspectable card art if those surfaces do not consistently suppress touch callout and dragging.

**Logged fix plan:**
- extend touch-callout suppression to every inspectable card surface and nested card image
- ensure card art used in hand, board, collection, inspect, and reward views is `draggable={false}`
- keep `onContextMenu={preventDefault}` at the interaction root and verify the press path does not escape through nested art elements
- run device checks specifically on iPhone Safari for hand cards, battlefield units, collection cards, and pack reveals

#### iPhone PWA issue
**Observed behavior:** the app can appear installable elsewhere but effectively never offers a working install flow on iPhone.

**Likely root cause:** the current UI only becomes actionable when `beforeinstallprompt` fires. That flow works in Chromium browsers, but iOS Safari uses a manual Share → Add to Home Screen flow and does not expose that event.

**Logged fix plan:**
- add iPhone/iPad detection plus a standalone-mode check so the app can show the right install state on Apple devices
- replace the current `Unavailable` dead end with explicit in-app Add to Home Screen instructions for iOS
- keep the existing manifest, icons, and service worker registration, but verify them through an iPhone-specific install checklist over HTTPS
- confirm post-install standalone launch behavior, icon quality, safe-area handling, and service-worker update flow on real Safari/Web.app

---

## 3. Recommended Technical Direction

## 3.1 Short-term visual architecture
Keep the current React app and provider structure for state, auth, server sync, and screen logic.
Refactor the visuals around a scene shell.

### Scene shell model
Each screen should eventually follow this shared structure:

1. **Scene backdrop layer**
   - full-bleed background art
   - depth lighting and atmosphere

2. **Ambient FX layer**
   - particles, glow, floating runes, embers, dust, etc.
   - purely decorative, never interactive

3. **Anchored scene content layer**
   - battle board, hand rail, nav tiles, pack rails, podiums, etc.
   - interaction-safe and layout-stable

4. **Overlay layer**
   - tooltips, toasts, inspect cards, modal flows, ceremonies

This becomes the app-wide pattern for Home, Play, Collection, Social, Shop, Settings, and Battle.

## 3.2 Rendering engine recommendation

### Best path: React + PixiJS hybrid
We should **not** do a full engine rewrite right now.
The best upgrade path is:

- **React** stays responsible for app state, providers, auth, routing, menus, modal flows, and typed UI logic
- **PixiJS** powers advanced 2D rendering where it matters most:
  - battle backdrops
  - particles and ambient scene layers
  - richer board feedback
  - scene-depth polish
  - ceremony effects

### Why this is the right move
- lower risk than moving everything to Phaser or a non-web engine
- preserves the existing TypeScript and React codebase
- supports the floating animated presentation we want
- lets us progressively upgrade visuals without breaking core gameplay logic

### Explicit recommendation
- **Do now:** scene-shell refactor in React/CSS
- **Do next:** add PixiJS for battle and ambient effects
- **Do not do now:** full engine migration or complete app rewrite

## 3.3 Design alignment opportunities

These are additional design-focused opportunities that align with the same direction and should guide future implementation.

### Visual hierarchy rules
- every scene should have **one dominant focal plane**
- in battle, the **board owns the center**, identity and state stay compressed at the edges
- persistent labels should only remain visible if they add information that the art, icon, or state treatment cannot already communicate
- if a new panel or badge competes with the board or hand, it should be reduced, moved, or made transient

### Battle ergonomics and readability
- the enemy and player hero anchors should feel like a mirrored pair, not unrelated widgets
- primary actions should sit in the lower thumb-reach zone without covering cards or lanes
- the hand should visually tuck under the battlefield as a rail, not behave like a second page section
- overlap should create depth, not obstruction
- combat guidance should prefer short chips, highlights, and icon feedback over full-width instructional copy

### Card readability grammar
- every live card should follow the same information map:
  - **cost** at the upper corner
  - **effect seal** at the opposite upper corner
  - **art** as the visual center
  - **attack / health** anchored at the bottom edge
- effect icons should stay visually consistent across hand, board, inspect, collection, and rewards
- selected, playable, exhausted, guarded, and targetable states should be readable from silhouette and edge-lighting alone

### Scene depth and composition
- each major scene should use three visible depth cues:
  - background environment
  - midground gameplay surface
  - foreground dock / overlay layer
- shadows, glow, blur, and overlap should separate layers intentionally rather than decorate every surface equally
- negative space is part of the design; not every area needs a framed widget

### UI restraint rules
- avoid repeating the same information in title bars, badges, helper copy, and buttons at the same time
- reduce sentence-heavy instructional text in active play spaces
- prefer icon + number + short label over full status paragraphs
- if an element is always present but rarely important, it should likely be compact, contextual, or hidden behind inspect / modal flow

### Environment storytelling opportunities
- Home can feel like a war table with a live campaign map
- Play can feel like an arena gate or summoning portal
- Collection can feel like a living archive or forge shelf
- Social can feel like a tavern hall with banners, notices, and clan heraldry
- Shop can feel like a merchant vault with featured items staged physically in the scene
- Settings can feel like a scribe desk or command ledger rather than an admin dashboard

---

## 4. Execution Plan

## Phase A — Battle Recovery First

**Status:** [ ] Not started  [x] In progress  [x] Identified as top priority

**Goal:** Restore a fully playable battle screen before deeper visual expansion.

### Deliverables
- [ ] no UI element blocks the board
- [ ] no UI element blocks the hand
- [ ] all three lanes for both sides remain readable on mobile
- [ ] all battle actions are reachable and tappable
- [ ] the board remains the main visual focus
- [ ] enemy and player hero anchors feel visually paired and equally intentional
- [ ] combat information is readable in under a glance without redundant helper text

### Required changes
- [x] remove the unstable mixed overlay/section-card arrangement from battle
- [x] re-anchor enemy HUD, player HUD, hand rail, and end-turn controls as stable scene elements
- [x] keep only one intentional battle surface in the viewport
- [x] restore the stacked overlapping hand fan with lift/zoom emphasis
- [x] remove the redundant hand-count / instructional rail header so card tops stay visible
- [x] surface effect seals on hand and battlefield cards so players can read mechanics at a glance
- [x] unify enemy and player health anchors so they share the same visual language and footprint
- [x] harden drag-to-play so upward pull gestures are not swallowed by scroll behavior
- [x] convert the enemy-turn notice into a floating overlay that never pushes the scene downward
- [x] replace the post-cinema fallback battlefield state with a dedicated battle-summary popup step
- [x] harden reward-cinema state handoff so battle conclusion UI cannot appear late on unrelated screens
- [ ] continue validating touch hit areas and drag/tap behavior on-device

### Acceptance gate
This phase is not complete until battle is actually playable on-device.

### Battle screen phasing guide — immediate design alignment pass

#### Phase A1 — Layout freeze and floating notices
**Goal:** stop reactive UI movement from cramming the battlefield.

Deliverables:
- move the enemy-turn banner from document flow into a true floating overlay
- keep the battle board and hand locked in place while turn-state notices appear
- ensure temporary notices fade or float above the arena instead of pushing content down

Rules:
- no battle-state banner should change the vertical footprint of the scene
- overlay notices must feel like combat effects, not extra page sections
- the board should never lose lane visibility because a status bar dropped in

#### Phase A2 — Mirrored combat anchors
**Goal:** make enemy and player identity surfaces feel like one system.

Deliverables:
- same visual size language for enemy and player hero anchors
- same spacing rhythm, chip treatment, and edge treatment for both sides
- the player dock stays compressed to the lower edge without covering the hand

Rules:
- health anchors should read as mirrored endpoints of the same arena
- resource chips should support the anchor, not compete with it
- only truly actionable controls should remain persistent in the lower dock

#### Phase A3 — Card visibility and battlefield literacy
**Goal:** improve understanding without more text.

Deliverables:
- card tops remain visible in the hand rail at all times
- effect seals are always visible on live cards
- lane state, exhaustion, guard, and targetability remain readable from the board alone

Rules:
- live card surfaces should explain themselves through icons, edge lighting, and state styling
- instructional copy should be minimized once the scene grammar is readable
- overlap should create a premium stacked-card feel without hiding cost or effect identity

#### Phase A4 — Post-battle cinematic completion
**Goal:** finish the win/loss flow cleanly and consistently.

Deliverables:
- keep the current reward cinema as scenes one through three
- add a **fourth popup scene** for battle summary after the reward beats finish
- this fourth step contains the final summary, reward recap, and the only persistent **Battle Again** / **Leave to Lobby** actions
- remove the jumbled fallback view of the battlefield with loose result buttons after the cinema ends

Rules:
- the player should exit battle through a modal conclusion, not by being dropped back into a partially active arena
- victory, defeat, and draw should all resolve through the same summary language
- the modal should feel like part of the same cinematic stack, not a generic browser dialog

#### Phase A5 — Reusable summary-popup system
**Goal:** turn this battle fix into an app-wide pattern.

Deliverables:
- define a shared summary popup style for post-battle, daily reward, pack recap, rank-up, and similar milestone moments
- use one visual grammar for header art, stat rows, reward rows, and CTA placement
- keep confirmation and recap surfaces aligned across the app so the style language stays consistent

Rules:
- summary popups should be concise, celebratory, and action-oriented
- they should reuse the same layered modal structure rather than inventing one-off result cards per feature
- similar moments across the app should feel related, even if the content differs

#### Phase A6 — Reward-flow hardening and cleanup
**Goal:** eliminate delayed, mismatched, or cross-screen recap behavior.

Deliverables:
- battle victory cinema and battle summary are strictly battle-scoped and cannot re-trigger after navigating elsewhere
- pack-opening recap uses pack-specific copy, icons, and neutral reward language rather than battle-victory framing
- duplicate refunds and new-card counts are presented cleanly without implying the player won a match
- reward overlays clear predictably when leaving battle, entering settings, or closing ceremony flows

Rules:
- no global recap state should leak from one feature into another
- battle results, pack results, and daily rewards may share structure, but they must not share misleading tone or headline copy
- if a reward flow is multi-step, the final step must resolve immediately in-context rather than appearing later on another screen

---

## Phase B — Shared Scene Shell Foundation

**Status:** [ ] Not started  [x] In progress

**Goal:** Replace the old stacked page framing model with a unified scene-first shell across the app.

### Deliverables
- [ ] top-level scene wrapper for all primary screens
- [ ] consistent layer model: backdrop / FX / content / overlays
- [ ] scene body owns scroll only where intentionally needed
- [ ] docked chrome behaves consistently on mobile
- [x] overlay-driven experiences opt out of scene swiping whenever they need horizontal card or carousel gestures
- [x] submenu headers and back controls now compress and wrap safely at 375px width

### Planned structure
- [x] create shared scene shell styling in [src/App.css](src/App.css)
- [ ] update the shell flow in [src/App.tsx](src/App.tsx)
- [ ] ensure all screen roots can host floating animated elements safely
- [ ] remove dependence on stacked section-card layouts as the primary screen structure
- [x] add explicit swipe-lock rules for pack ceremony, reward recaps, and future overlay galleries
- [x] contain dense shop/settings subviews inside the safe mobile viewport without horizontal spill

### Success criteria
- screens feel like self-contained game scenes
- floating effects no longer fight document flow
- battle-specific layout hacks are no longer necessary just to keep the app usable
- overlays that support horizontal review do not accidentally trigger scene changes
- back navigation remains reachable in every subview on a phone screen

### Phase B1 — Overlay gesture isolation and viewport containment
**Goal:** stop scene navigation and layout overflow from fighting local UI interactions.

Deliverables:
- add overlay-level swipe opt-out coverage for pack opening, reward review, and similar horizontally browsed content
- ensure back buttons, subnav badges, and primary calls-to-action wrap or compress safely on narrow screens
- keep long settings and shop content inside dedicated scroll containers rather than pushing controls off-screen

Rules:
- horizontal reveal gestures must belong to the active overlay, not the scene router underneath it
- no mobile submenu should require guessing where the back action went
- content density must compress or scroll intentionally instead of spilling beyond the viewport

### Phase B2 — Mobile Safari interaction and install reliability
**Goal:** make touch interactions and home-screen install flow behave like a real app on iPhone.

Deliverables:
- long-press inspect opens the in-app card modal without the browser image/context menu stealing the gesture
- all inspectable card art suppresses native drag/callout behavior consistently
- Settings and onboarding show the correct iPhone install guidance when browser install prompts are unavailable
- the PWA can be added to the iPhone home screen and launched in standalone mode with the expected icon and safe-area behavior

Rules:
- do not rely on `beforeinstallprompt` as the only install path
- treat iPhone Safari and Web.app as a first-class platform with explicit checks
- if a native browser affordance breaks immersion during long press, the app must suppress it at the surface level rather than hoping the wrapper handler is enough

---

## Phase C — Battle Scene Rebuild

**Status:** [ ] Not started

**Goal:** Rebuild battle into an original premium card-battler arena layout.

### Visual layout target
- enemy hero anchor at the top of the arena
- battlefield in the visual center
- player hero and action dock at the bottom of the arena
- hand as a dedicated rail below or integrated into the lower scene edge
- no giant standalone header section

### Detailed tasks
- [ ] create stable hero anchors rather than large floating slabs
- [ ] rebuild the board into a true centered arena stage
- [x] create a more compact player action dock with turn, burst, and leave controls kept off the board itself
- [x] refit the hand rail for full visibility, overlap, and reliable touch interaction
- [x] remove duplicate headings, redundant hand labels, and oversized guidance copy that waste vertical space
- [x] preserve inspect, drag, tap, and attack-target flows through the rebuild
- [x] keep effect icons readable on live cards without forcing inspect-first play
- [x] keep the horizontal hand rail scroll-friendly while still allowing vertical pull-up drag commits
- [x] replace the static in-scene battle result card with the fourth cinematic summary popup
- [x] ensure temporary enemy-turn messaging floats above the arena instead of shifting layout
- [ ] harden battle result sequencing so cinematic victory flow cannot be skipped, delayed, or replayed on a later screen

### Interaction goals
- [x] card play supports reliable upward pull-to-play in addition to tap
- [ ] card play feels tactile
- [ ] attack telegraphs are readable
- [ ] state changes feel animated but not cluttered
- [x] the battle scene remains understandable at a glance

---

## Phase D — Unified Chrome and Visual Language

**Status:** [ ] Not started  [x] In progress

**Goal:** Make every screen feel like the same game, not a mixture of scene UI and old web panels.

### Deliverables
- [ ] one-owner chrome rule for all surfaces
- [ ] no frame-within-frame artifacts
- [ ] consistent panel, button, badge, and divider language
- [x] consistent scene spacing and anchoring rules across all screens
- [ ] a clear information hierarchy where primary, secondary, and decorative surfaces are easy to distinguish

### Design system additions
- [ ] define a shared scale for **hero surfaces**, **action docks**, **chips**, and **overlay cards** so sizes feel intentional across the app
- [ ] define color-role rules so player, enemy, neutral system state, reward, and danger all read consistently
- [ ] define when text should be persistent versus contextual versus inspect-only
- [ ] standardize icon placement on cards and badges so the same mechanic never moves around visually between screens
- [ ] define a reusable **summary popup** template for battle recap, pack recap, daily reward, rank-up, and other milestone moments
- [ ] use environmental props and negative space to carry theme instead of filling every gap with another framed box

### Refactor rules
- [ ] a surface owns either SVG-style chrome or CSS edge treatment, never both
- [ ] no empty framed rectangles with no gameplay purpose
- [ ] no legacy dashboard slabs carried into scene layouts
- [ ] all primary player actions remain prominent and scene-native

---

## Phase E — App-Wide Scene Migration

**Status:** [x] Core scene migration complete  [ ] Device validation follow-up

**Goal:** Extend the same scene-first architecture beyond battle.

### Home
- [x] convert into a war-room style scene
- [x] nav actions feel embedded in the scene rather than listed in cards
- [x] season and quest info act as anchored utility elements

### Play
- [x] turn mode selection into a proper arena-gate scene
- [x] queue/search state becomes a central stage, not a page stack

### Collection
- [x] become an archive/forge scene
- [x] card browser remains the main surface
- [x] deck tools feel anchored instead of stacked

### Social
- [x] become a tavern/hall scene
- [x] leaderboard, friends, clan, and trade areas share one cohesive presentation

### Shop
- [x] become a merchant/bazaar scene
- [x] packs, cosmetics, and rune economy appear as anchored displays and rails
- [x] pack opening and reveal review stay fully inside the active shop flow without using battle-victory framing
- [x] newly opened cards are browsed cleanly with swipe-safe overlays and no accidental section changes

### Settings
- [x] become a scribe-desk scene
- [x] account and admin surfaces remain readable without reverting to generic dashboard styling
- [x] subview headers, back controls, and dense admin/support content stay fully visible and scroll safely on phone screens

---

## Phase F — Motion, FX, and Rendering Upgrade

**Status:** [ ] Not started

**Goal:** Add the richer animated layer the app needs after layout foundations are stable.

### Immediate motion goals
- [ ] better scene transitions
- [ ] cleaner floating ambient FX
- [ ] richer battle feedback
- [ ] smoother reward and pack presentation

### Rendering upgrade track
- [ ] add a PixiJS evaluation spike
- [ ] prototype a battle scene FX layer with particles and parallax
- [ ] confirm React + PixiJS data flow is stable
- [ ] roll PixiJS into battle first, then optional ambient layers for other scenes

### Important guardrail
We should only expand motion after the scene shell is stable and battle is reliably playable.

---

## Phase G — Device Validation and Final Edge Polish

**Status:** [ ] Not started  [x] In progress

**Goal:** confirm the scene-first shell behaves correctly on real phones, installed PWAs, and narrow viewport edge cases.

### Validation checklist
- [ ] verify iPhone Safari browser mode for long-press inspect, swipe isolation, and install guidance
- [ ] verify iPhone Home Screen launch for safe-area spacing, top chrome, bottom nav reachability, and update prompts
- [ ] verify Android Chrome browser mode for install prompt flow, queue overlays, and battle drag reliability
- [ ] verify Android installed PWA for splash-to-app launch, reward cinema containment, and service worker update handling
- [x] implement fit-safe mobile layouts so shop subviews no longer run off the right edge and the play gate keeps all battle types visible without needing scroll
- [ ] confirm no horizontal spill or clipped back actions at 375px width in shop, settings, and social subviews
- [ ] confirm battle drag, attack targeting, inspect, and result-summary flows remain stable through repeated matches

---

## 5. Progress Tracker

| Workstream | Status | Notes |
|---|---|---|
| Battle playability recovery | Active | Single-surface shell, restored stacked hand fan, floating enemy-turn notice, scoped reward flow, and the shared summary popup are in place; on-device confirmation is the main remaining gate |
| Shared scene shell | Active | Core battle scene styling is now joined by overlay gesture isolation and mobile-safe subview containment |
| Battle arena rebuild | Active | Board-first layout is stable, with remaining work focused on broader device validation and follow-on polish |
| Unified chrome cleanup | Active | Shared scene-header/stage language now extends across Home, Play, Collection, Social, Shop, and Settings; the remaining work is final edge cleanup and on-device verification |
| App-wide scene migration | Active | Core scene migration is now established across every primary screen; only device validation and edge cleanup remain |
| Device validation & edge polish | Active | Real-phone QA, safe-area verification, and final chrome containment are now the top follow-up tasks |
| PixiJS rendering spike | Planned | Hybrid visual upgrade path |
| Motion and ambient polish | Planned | Only after layout stability is restored |

---

## 6. File Targets for the Next Execution Pass

### Highest priority
- [src/App.css](src/App.css)
- [src/App.tsx](src/App.tsx)
- [src/components/TopBar.tsx](src/components/TopBar.tsx)
- [src/components/NavBar.tsx](src/components/NavBar.tsx)
- [docs/release-checklist.md](docs/release-checklist.md)

### Supporting scene-shell work
- [src/screens/BattleScreen.tsx](src/screens/BattleScreen.tsx)
- [src/screens/ShopScreen.tsx](src/screens/ShopScreen.tsx)
- [src/screens/SettingsScreen.tsx](src/screens/SettingsScreen.tsx)
- [src/screens/SocialScreen.tsx](src/screens/SocialScreen.tsx)

### Rendering upgrade track
- new battle-scene visual layer components
- possible PixiJS integration entry points

---

## 7. Rules for This Refactor

- [ ] Do not keep layering floating HUD pieces onto old stacked page layouts
- [ ] Do not treat battle as a dashboard screen
- [ ] Do not add more temporary battle patches without aligning to the scene model
- [ ] Keep all gameplay state in the current React/provider architecture
- [ ] Keep all visuals original and project-specific
- [ ] Validate on a phone viewport before calling any visual phase complete

---

## 7.1 Design review checklist

Before any design-heavy phase is called complete, review the screen against these questions:

- [ ] can a first-time player identify whose turn it is within about two seconds?
- [ ] can the player immediately find their health, mana, momentum, and hand without hunting?
- [ ] is the board still the strongest visual focal point during combat?
- [ ] do the enemy and player anchors feel like parts of the same system?
- [ ] are effect mechanics visible from the live card surfaces, not hidden behind inspect?
- [ ] has redundant text been removed where icons, chips, or motion already explain the state?
- [ ] does overlap create depth rather than cover important gameplay information?
- [ ] does the scene feel like a place in the game world rather than a dashboard made of stacked cards?

## 8. Definition of Done

This direction is only complete when all of the following are true:

- [ ] battle is playable and uncluttered on mobile
- [ ] the app no longer reads like a stack of sectioned web pages
- [ ] floating animated elements have a stable shared visual system
- [ ] the board and hand remain clear during play
- [ ] all primary screens feel like scenes from the same game world
- [ ] richer rendering is introduced safely through a hybrid architecture
- [x] tests pass
- [x] lint passes
- [x] build passes

---

## 9. Immediate Next Step

**Next implementation target:**

1. run the real iPhone Safari and Web.app validation pass against the checklist above
2. confirm Android browser and installed-PWA behavior for battle, rewards, and queue flows
3. fix any remaining safe-area, overflow, or gesture edge cases discovered during device QA
4. then continue the richer ambient rendering and motion upgrade path
