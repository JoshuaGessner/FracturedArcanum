# Client UI Index

The client is now fully organized around a thin provider tree, typed slice hooks, and seven presentational screens. The current UI layer is heavily asset-backed and designed to stay easy to reskin later.

## Provider and shell structure

```
App
└── QueueProvider
    └── ProfileProvider
        └── SocialProvider
            └── GameProvider
                └── AppShell
                    ├── TopBar
                    ├── BattleIntroOverlay
                    ├── RewardOverlay
                    ├── ToastStack / modals
                    ├── 7 mounted screens
                    └── NavBar
```

### Core files

| File | Lines | Purpose |
|------|------:|---------|
| `src/App.tsx` | 2,905 | Provider composition, AppShell state/effects, screen routing, handler wiring |
| `src/AppShellContext.ts` | 222 | Shared shell context type and access |
| `src/constants.ts` | 284 | Static UI data and semantic asset registry |
| `src/utils.ts` | 246 | Pure helpers for asset lookups, transitions, completion, severity, streaks, and hand fan tilt |
| `src/audio.ts` | 160 | Synthesized sound library |

## Screen index

All screens are propless and read from the typed hooks in `src/contexts/`.

| Screen | Lines | Hooks used | Key visual elements |
|--------|------:|------------|---------------------|
| `HomeScreen.tsx` | 97 | `useAppShell`, `useGame`, `useProfile` | season framing, reward-ready quests, nav tiles, streak badge, resume battle |
| `PlayScreen.tsx` | 164 | `useGame`, `useQueue` | mode cards, difficulty chips, queue portal, VS found banner |
| `CollectionScreen.tsx` | 308 | `useProfile`, `useGame` | collection ring, rune dividers, rarity gem filters, deck forge cards |
| `SocialScreen.tsx` | 428 | `useAppShell`, `useProfile`, `useQueue`, `useSocial` | guild command hero, leaderboard, live challenge CTA, clan and trade surfaces |
| `ShopScreen.tsx` | 302 | `useAppShell`, `useGame`, `useProfile` | reward vault urgency, theme and border cards, pack reveal stage |
| `SettingsScreen.tsx` | 600 | `useAppShell`, `useProfile` | scribe-desk hero, preference tiles, complaint desk, admin console |
| `BattleScreen.tsx` | 376 | `useAppShell`, `useGame`, `useProfile` | command-dais HUD, enemy-turn banner, frontlines, reward summary, hand-fan layout |

## Shared components

| Component | Lines | Purpose |
|-----------|------:|---------|
| `src/components/AssetBadge.tsx` | 66 | Shared effect, rarity, rank, stat, and pack visuals |
| `src/components/BattleIntroOverlay.tsx` | 34 | Cinematic battle-entry overlay |
| `src/components/RewardOverlay.tsx` | 89 | Victory ceremony and reward summary overlay |
| `src/components/TopBar.tsx` | 48 | Shell header and device actions |
| `src/components/NavBar.tsx` | 32 | Bottom 6-tab navigation |
| `src/components/CardInspectModal.tsx` | 56 | Long-press card inspect modal |
| `src/components/ConfirmModal.tsx` | 61 | Shared confirmation surface |
| `src/components/ToastStack.tsx` | 18 | Toast renderer |

## Navigation flow map

| From | To | Transition intent |
|------|----|-------------------|
| Home | Play / Collection / Social / Shop / Settings | forward |
| Any non-battle screen | Battle | battle entry |
| Shop ↔ Social / Collection ↔ Social | lateral or sequential shell flow |
| Play / Settings / Shop / Social | Home | back |
| Battle result | Home or replay | battle exit / replay loop |

The transition class selection is centralized in `getScreenTransitionClass()` inside `src/utils.ts`.

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

### Main shell
- generated nav tiles and bottom nav chrome
- topbar branding and control actions
- season progress and reward urgency

### Play flow
- mode card chooser
- queue portal search state
- opponent found VS reveal

### Collection flow
- completion ring
- rune dividers
- gem-based rarity filters
- richer deck roster presentation

### Social flow
- guild command hero card
- leaderboard rows with rank art
- live friend challenge actions
- clan and trading surfaces

### Shop flow
- reward vault callout
- pack art and reveal stage
- border and theme presentation cards

### Settings flow
- scribe-desk preference tiles
- complaint severity seals
- admin analytics, user roles, and audit views

### Battle flow
- cinematic VS intro
- enemy-turn banner with crest styling
- hand-fan layout
- victory and reward summary overlay

## Conventions

- screens stay mounted and are toggled with `screen-panel active` state classes
- game logic stays in `src/game.ts`; UI only reads state and triggers handlers
- shared UI art should route through the semantic asset registry and `AssetBadge` primitives
- long-press inspect still goes through `getLongPressProps()` from the game slice
