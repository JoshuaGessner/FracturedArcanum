# Fractured Arcanum — Unified Scene-First Refactor Plan

> Updated 2026-04-18.
> This file replaces older planning notes that no longer match the current direction.
> The active goal is a unified, scene-based game presentation with floating animated elements, board-first battle play, and a cleaner progress tracker.

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

### Required changes
- [x] remove the unstable mixed overlay/section-card arrangement from battle
- [x] re-anchor enemy HUD, player HUD, hand rail, and end-turn controls as stable scene elements
- [x] keep only one intentional battle surface in the viewport
- [x] restore the stacked overlapping hand fan with lift/zoom emphasis
- [x] surface effect seals on hand and battlefield cards so players can read mechanics at a glance
- [ ] ensure touch hit areas and drag/tap behavior work reliably again

### Acceptance gate
This phase is not complete until battle is actually playable on-device.

---

## Phase B — Shared Scene Shell Foundation

**Status:** [ ] Not started  [x] In progress

**Goal:** Replace the old stacked page framing model with a unified scene-first shell across the app.

### Deliverables
- [ ] top-level scene wrapper for all primary screens
- [ ] consistent layer model: backdrop / FX / content / overlays
- [ ] scene body owns scroll only where intentionally needed
- [ ] docked chrome behaves consistently on mobile

### Planned structure
- [x] create shared scene shell styling in [src/App.css](src/App.css)
- [ ] update the shell flow in [src/App.tsx](src/App.tsx)
- [ ] ensure all screen roots can host floating animated elements safely
- [ ] remove dependence on stacked section-card layouts as the primary screen structure

### Success criteria
- screens feel like self-contained game scenes
- floating effects no longer fight document flow
- battle-specific layout hacks are no longer necessary just to keep the app usable

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
- [ ] create a compact player action dock with turn/burst controls
- [x] refit the hand rail for full visibility, overlap, and reliable touch interaction
- [ ] remove duplicate headings and oversized labels that waste vertical space
- [x] preserve inspect, drag, tap, and attack-target flows through the rebuild
- [x] keep effect icons readable on live cards without forcing inspect-first play

### Interaction goals
- [ ] card play feels tactile
- [ ] attack telegraphs are readable
- [ ] state changes feel animated but not cluttered
- [ ] the battle scene remains understandable at a glance

---

## Phase D — Unified Chrome and Visual Language

**Status:** [ ] Not started

**Goal:** Make every screen feel like the same game, not a mixture of scene UI and old web panels.

### Deliverables
- [ ] one-owner chrome rule for all surfaces
- [ ] no frame-within-frame artifacts
- [ ] consistent panel, button, badge, and divider language
- [ ] consistent scene spacing and anchoring rules across all screens

### Refactor rules
- [ ] a surface owns either SVG-style chrome or CSS edge treatment, never both
- [ ] no empty framed rectangles with no gameplay purpose
- [ ] no legacy dashboard slabs carried into scene layouts
- [ ] all primary player actions remain prominent and scene-native

---

## Phase E — App-Wide Scene Migration

**Status:** [ ] Not started

**Goal:** Extend the same scene-first architecture beyond battle.

### Home
- [ ] convert into a war-room style scene
- [ ] nav actions feel embedded in the scene rather than listed in cards
- [ ] season and quest info act as anchored utility elements

### Play
- [ ] turn mode selection into a proper arena-gate scene
- [ ] queue/search state becomes a central stage, not a page stack

### Collection
- [ ] become an archive/forge scene
- [ ] card browser remains the main surface
- [ ] deck tools feel anchored instead of stacked

### Social
- [ ] become a tavern/hall scene
- [ ] leaderboard, friends, clan, and trade areas share one cohesive presentation

### Shop
- [ ] become a merchant/bazaar scene
- [ ] packs, cosmetics, and rune economy appear as anchored displays and rails

### Settings
- [ ] become a scribe-desk scene
- [ ] account and admin surfaces remain readable without reverting to generic dashboard styling

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

## 5. Progress Tracker

| Workstream | Status | Notes |
|---|---|---|
| Battle playability recovery | Active | Single-surface shell, restored stacked hand fan, and visible effect seals are in place; on-device validation still needed |
| Shared scene shell | Active | Core battle scene styling has started replacing split stacked layout with intentional layering |
| Battle arena rebuild | Active | Board-first layout is underway with anchored hero and hand zones |
| Unified chrome cleanup | Planned | Removes frame-within-frame artifacts |
| App-wide scene migration | Planned | Apply the same model to all screens |
| PixiJS rendering spike | Planned | Hybrid visual upgrade path |
| Motion and ambient polish | Planned | Only after layout stability is restored |

---

## 6. File Targets for the Next Execution Pass

### Highest priority
- [src/screens/BattleScreen.tsx](src/screens/BattleScreen.tsx)
- [src/App.css](src/App.css)
- [src/App.tsx](src/App.tsx)

### Supporting scene-shell work
- [src/components](src/components)
- [src/screens/HomeScreen.tsx](src/screens/HomeScreen.tsx)
- [src/screens/PlayScreen.tsx](src/screens/PlayScreen.tsx)
- [src/screens/CollectionScreen.tsx](src/screens/CollectionScreen.tsx)
- [src/screens/SocialScreen.tsx](src/screens/SocialScreen.tsx)
- [src/screens/ShopScreen.tsx](src/screens/ShopScreen.tsx)
- [src/screens/SettingsScreen.tsx](src/screens/SettingsScreen.tsx)

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

1. finish on-device validation of the new battle shell
2. rebuild the battle arena further inside this unified system
3. extend the same scene architecture across the rest of the app
4. then layer in the richer rendering and motion upgrade
