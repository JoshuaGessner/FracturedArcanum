# Client UI Index

The client is organized around a thin provider tree, typed slice hooks, and seven presentational screens. The shipped UI layer is asset-backed, mobile-first, and built around a one-scene shell model.

## Provider and shell structure

```text
App
└── QueueProvider
    └── ProfileProvider
        └── SocialProvider
            └── GameProvider
                └── AppShell
                    ├── TopBar
                    ├── BattleIntroOverlay
                    ├── RewardCinemaOverlay
                    ├── OnboardingTour
                    ├── PackCeremonyOverlay
                    ├── ToastStack / modals
                    ├── 7 mounted screens
                    └── NavBar
```

### Core files

| File | Lines | Purpose |
|------|------:|---------|
| `src/App.tsx` | 3,156 | Provider composition, AppShell state/effects, screen routing, reconnect recovery, and shared handler wiring |
| `src/AppShellContext.ts` | 244 | Shared shell context type and access |
| `src/constants.ts` | 284 | Static UI data and semantic asset registry |
| `src/utils.ts` | 277 | Pure helpers for asset lookups, transitions, completion, severity, streaks, and hand fan tilt |
| `src/audio.ts` | 338 | Synthesized sound library |

## Screen index

All screens are propless and read from the typed hooks in `src/contexts/`.

| Screen | Lines | Hooks used | Key visual elements |
|--------|------:|------------|---------------------|
| `HomeScreen.tsx` | 119 | `useAppShell`, `useGame`, `useProfile` | season framing, reward-ready quests, streak fire, nav tiles, resume battle |
| `PlayScreen.tsx` | 140 | `useAppShell`, `useGame`, `useProfile`, `useQueue` | mode cards, difficulty chips, queue portal, VS found banner, live ladder strip |
| `CollectionScreen.tsx` | 329 | `useAppShell`, `useGame`, `useProfile`, `useQueue` | collection ring, rarity completion chips, deck forge cards, breakdown flow |
| `SocialScreen.tsx` | 391 | `useAppShell`, `useProfile`, `useQueue`, `useSocial` | command hero, leaderboard, friend challenge CTA, clan and trade surfaces |
| `ShopScreen.tsx` | 321 | `useAppShell`, `useGame`, `useProfile` | reward vault urgency, theme and border cards, pack ceremony and reveal summary |
| `SettingsScreen.tsx` | 565 | `useAppShell`, `useProfile` | compact preference hero, complaint desk, and role-gated admin console |
| `BattleScreen.tsx` | 780 | `useAppShell`, `useGame`, `useProfile` | slim duel ribbon, board-first arena, drag-to-play, attack arrow, hand-fan layout |

## Shared components

| Component | Lines | Purpose |
|-----------|------:|---------|
| `src/components/AssetBadge.tsx` | 66 | Shared effect, rarity, rank, stat, and pack visuals |
| `src/components/BattleIntroOverlay.tsx` | 34 | Cinematic battle-entry overlay |
| `src/components/RewardCinemaOverlay.tsx` | 238 | Unified reward presentation across battle, daily, pack, and rank-up moments |
| `src/components/PackCeremonyOverlay.tsx` | 303 | Full-screen pack opening ceremony |
| `src/components/OnboardingTour.tsx` | 303 | First-launch and replayable spotlight tour |
| `src/components/TopBar.tsx` | 48 | Shell header and device actions |
| `src/components/NavBar.tsx` | 33 | Bottom 6-tab navigation |
| `src/components/CardInspectModal.tsx` | 62 | Long-press card inspect modal |
| `src/components/ConfirmModal.tsx` | 79 | Shared confirmation surface |
| `src/components/ToastStack.tsx` | 22 | Toast renderer |

## Navigation flow map

| From | To | Transition intent |
|------|----|-------------------|
| Home | Play / Collection / Social / Shop / Settings | forward |
| Any non-battle screen | Battle | battle entry |
| Shop ↔ Social / Collection ↔ Social | lateral or sequential shell flow |
| Play / Settings / Shop / Social | Home | back |
| Battle result | Home or replay | battle exit / replay loop |

The transition class selection is centralized in `getScreenTransitionClass()` inside `src/utils.ts`, and swipe gestures route through the same neighbor mapping.

## Screen background mapping

| Screen class | Generated asset |
|--------------|-----------------|
| `.home-screen` | `bg-main-menu.svg` |
| `.play-screen` | `bg-play.svg` |
| `.collection-screen` | `bg-collection.svg` |
| `.social-screen` | `bg-social.svg` |
| `.shop-screen` | `bg-shop.svg` |
| `.settings-screen` | `bg-settings.svg` |
| `.battlefield` | `bg-battle.svg` |

## Current visual systems

### Scene shell
- `100dvh` app shell with no body scroll
- active screen owns the content scroll region
- bottom nav and header stay docked

### Main shell and feedback
- generated nav tiles and bottom nav chrome
- topbar branding and device actions
- scene transitions, ambient audio, and tactile feedback wiring

### Reward and ceremony flow
- unified reward cinema overlay
- daily claim and rank-up beats
- pack ceremony overlay with rarity reveals

### Battle flow
- cinematic VS intro
- board-first arena layout
- drag-to-play and attack telegraph
- hero reactions, low-HP heartbeat, and hand-fan layout

## Conventions

- screens stay mounted and are toggled with `screen-panel active` state classes
- game logic stays in `src/game.ts`; UI only reads state and triggers handlers
- shared UI art routes through the semantic asset registry and `AssetBadge` primitives
- long-press inspect still goes through `getLongPressProps()` from the game slice
