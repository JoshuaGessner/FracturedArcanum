# Client UI Index

The client is organized around a thin provider tree, typed slice hooks, and seven presentational screens. The shipped UI layer is asset-backed, mobile-first, and built around a one-scene shell model.

## Provider and shell structure

The providers are siblings, not a hierarchy — none reads another, so the
nesting order below carries no meaning.

```text
App
└── AccountProvider          identity: sign-in, passkeys, recovery, sessions
    └── PlayerProvider       the server-authoritative record + all 18 derivations
        └── QueueProvider
            └── ProfileProvider   client-side decks, collection, shop
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

| File | Purpose |
|------|---------|
| `src/App.tsx` | Provider composition, AppShell state/effects, screen routing, reconnect recovery, and shared handler wiring |
| `src/AppShellContext.ts` | Shared shell context type and access |
| `src/contexts/PlayerProvider.tsx` | `serverProfile` and everything read off it — shards, rank, record, cosmetics, role |
| `src/constants.ts` | Static UI data and semantic asset registry |
| `src/utils.ts` | Pure helpers for asset lookups, transitions, completion, severity, streaks, and hand fan tilt |
| `src/audio.ts` | Synthesized sound library |

## Screen index

All screens are propless and read from the typed hooks in `src/contexts/`.

There is no `PlayScreen`. It was absorbed into the Home hub: the mode cards now
live in `src/components/BattleLaunchSheet.tsx`, opened from Home's battle CTA.

> Line counts are indicative only and drift with every change. Use this table to
> find the right file, then read the source.

| Screen | Hooks used | Key visual elements |
|------|------|
| `HomeScreen.tsx` | `useAppShell`, `useGame`, `useProfile` | season framing, quest board, quest ledger subview, streak fire, primary battle CTA, Abandon control for a pending match |
| `CollectionScreen.tsx` | `useAppShell`, `useGame`, `useProfile`, `useQueue` | collection ring, rarity completion chips, deck forge cards, breakdown flow |
| `SocialScreen.tsx` | `useAppShell`, `useProfile`, `useQueue`, `useSocial` | command hero, leaderboard, friend challenge CTA, clan and trade surfaces |
| `ShopScreen.tsx` | `useAppShell`, `useGame`, `useProfile` | reward vault urgency, theme and border cards, pack ceremony and reveal summary |
| `SettingsScreen.tsx` | `useAppShell`, `useProfile` | compact preference hero, complaint desk, and role-gated admin console |
| `BattleScreen.tsx` | `useAppShell`, `useGame`, `useProfile` | slim duel ribbon, board-first arena, drag-to-play, attack arrow, hand-fan layout |

## Shared components

| Component | Lines | Purpose |
|------|------|
| `src/components/AssetBadge.tsx` | Shared effect, rarity, rank, stat, and pack visuals, plus the mask glyphs `Glyph`, `InterfaceGlyph` and `TribeSigil` that replaced every emoji |
| `src/components/CardFace.tsx` | The one card face used by hand, board, collection, inspect and pack reveals |
| `src/components/BattleHeroAnchor.tsx` | Hero plaque: crest, name, enemy hand/deck counts, mana crystals with a large count, health medallion; the enemy plaque is the strike target while attacking |
| `src/components/BurstMedallion.tsx` | Burst control carrying momentum: charge ring, notch at the cost of 3, lit when affordable |
| `src/components/HealthPopBadge.tsx` | Floating `-3` / `+2` over a unit or hero (driven by `src/hooks/useHealthPops.ts`) |
| `src/components/HomeDeckShowcase.tsx` | Home: the active deck's headline cards, name and readiness beside Battle, with arrows to switch decks |
| `src/components/SettingSwitch.tsx` | Brass `role="switch"` toggle for binary preferences |
| `src/components/HomeStatusRibbon.tsx` | Home identity, rating meter, and Record / Deck / Vault tiles |
| `src/components/HomeQuestBoard.tsx` | Home quest board with the featured contract |
| `src/components/QuestLedgerPanel.tsx` | Quest ledger subview with engraved quest glyphs |
| `src/components/BattleIntroOverlay.tsx` | Cinematic battle-entry overlay |
| `src/components/RewardCinemaOverlay.tsx` | Unified reward presentation across battle, daily, pack, and rank-up moments |
| `src/components/PackCeremonyOverlay.tsx` | Full-screen pack opening ceremony |
| `src/components/OnboardingTour.tsx` | First-launch and replayable spotlight tour |
| `src/components/TopBar.tsx` | Shell header and device actions |
| `src/components/NavBar.tsx` | Bottom navigation: Home, Cards, Shop, Social |
| `src/components/CardInspectModal.tsx` | Long-press card inspect modal |
| `src/components/ConfirmModal.tsx` | Shared confirmation surface |
| `src/components/ToastStack.tsx` | Toast renderer |

## Navigation flow map

| From | To | Transition intent |
|------|------|
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
- drag-to-play with a fixed unclipped ghost layer, lane-targeted drops, and attack telegraph
- hero reactions, low-HP heartbeat, layered hand-fan layout, and live effect seals

## Scene-first style guardrails

- battle keeps the board as the dominant focal plane
- enemy and player anchors should read as mirrored endpoints of the same arena system
- transient notices should float as overlays and never reflow the battlefield
- reward, recap, and milestone conclusions should resolve through shared popup styling rather than one-off result cards
- live card surfaces should communicate mechanics through consistent icon placement before the player opens inspect

## Conventions

- screens stay mounted and are toggled with `screen-panel active` state classes
- game logic stays in `src/game.ts`; UI only reads state and triggers handlers
- shared UI art routes through the semantic asset registry and `AssetBadge` primitives
- long-press inspect still goes through `getLongPressProps()` from the game slice
