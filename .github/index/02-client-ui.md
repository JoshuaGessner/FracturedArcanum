# Client UI Index

The client UI was extracted from a 5,188-line monolith into a root file plus
screens/components/types/constants/utils modules. Shared shell concerns now
live in `AppShell` and are exposed through a slim `<AppShellContext.Provider>`.
Game/profile/social/queue state lives in real providers above `AppShell`, and
screens consume **typed slice hooks** from `src/contexts/` (`useGame`,
`useProfile`, `useSocial`, `useQueue`, `useAppShell`).

## File Structure

```
src/
├── App.tsx                    (2,800+ lines) App = provider tree; AppShell = effects+handlers+refs+provider+JSX
├── AppShellContext.ts         (200+ lines)   Slim AppShellContextValue type + createContext
├── contexts/                                Real providers + stable slice hooks
│   ├── index.ts
│   ├── QueueProvider.tsx      — ✅ Phase 1F: real provider above AppShell (state + countdown + liveQueueLabel)
│   ├── ProfileProvider.tsx    — ✅ Phase 1D: real provider above AppShell (decks, collection, pack-shop state)
│   ├── SocialProvider.tsx     — ✅ Phase 1E: real provider above AppShell (friends/clan/challenges/trades + nowTick)
│   ├── GameProvider.tsx       — ✅ Phase 1C: real provider above AppShell (battle/game presentation state)
│   ├── useGame.ts             — battle state, game actions, AI animation
│   ├── useProfile.ts          — decks, collection, cosmetics, derived rank
│   ├── useSocial.ts           — friends, clan, trades, challenges
│   ├── useQueue.ts            — matchmaking, leaderboard
│   └── useAppShell.ts         — auth, navigation, toasts, install/SW, complaints, admin
├── types.ts                   (252)          UI-only type definitions
├── constants.ts               (182)          Themes, borders, presets, labels
├── utils.ts                   (134)          Pure helpers
├── audio.ts                   (91)           Web Audio sound synthesis
├── main.tsx                   (55)           React root + service worker
├── index.css                  (33)           CSS reset
├── App.css                    (2,662)        All app styles
├── game.test.ts               (205)          Vitest engine tests
├── components/                              Shared UI primitives (prop-driven)
│   ├── ToastStack.tsx
│   ├── ConfirmModal.tsx
│   ├── CardInspectModal.tsx
│   ├── NavBar.tsx
│   ├── TopBar.tsx
│   ├── BattleIntroOverlay.tsx
│   └── RewardOverlay.tsx
└── screens/                                 7 main app screens (consume slice hooks)
    ├── HomeScreen.tsx        — main menu launchpad
    ├── PlayScreen.tsx        — match start, AI / queue
    ├── CollectionScreen.tsx  — deck builder + card grid
    ├── BattleScreen.tsx      — battle UI (multiple sibling sections)
    ├── SocialScreen.tsx      — friends, leaderboard, clan, trades
    ├── ShopScreen.tsx        — packs, themes, borders
    └── SettingsScreen.tsx    — privacy, complaints, admin
```

---

## `src/App.tsx` (2,889 lines)

Two components:

- **`App`** — thin wrapper that assembles the provider tree:
  `<QueueProvider><ProfileProvider><SocialProvider><GameProvider><AppShell/></GameProvider></SocialProvider></ProfileProvider></QueueProvider>`.
- **`AppShell`** — owns cross-cutting `useState`/`useRef`, effects, and
  handler functions. Just before its JSX return it builds an
  `AppShellContextValue` object literal and wraps the `<main>` tree in
  `<AppShellContext.Provider value={appCtx}>`. Screens consume typed slices
  from `src/contexts/`, which now compose the real providers with this slim
  shell context.

### Imports (Lines 1–62)
- React hooks + `FormEvent` type
- `socket.io-client`
- `playSound` from `./audio`
- Game engine selectors/types from `./game`
- Constants from `./constants`
- Utils from `./utils`
- Shared components from `./components/*`
- Screens from `./screens/*`
- Type re-exports from `./types`

### Helper Functions Inside App() (Lines ~357–525)

| Function | Purpose |
|----------|---------|
| `clearLongPressTimer()` | Cancel pending long-press inspect |
| `consumeLongPressAction()` | Returns true if click should be swallowed by long-press |
| `inspectCard(card)` | Open card inspect modal |
| `getLongPressProps(card)` | Returns onPointerDown/Up handlers for long-press |
| `inferToastSeverity(text)` | Auto-detect severity from message string |
| `setToastMessage(msg, sev?)` | Push to toast stack with auto-dismiss |
| `handleSetup`, `handleAuth`, `handleLogout` | First-launch + auth flows |

### Major Handlers (Lines ~1027–2528)

| Group | Lines | Handlers |
|-------|-------|----------|
| Decks | 1027–1115 | `handleCreateDeck`, `handleRenameDeck`, `handleDeleteDeck`, `handleSelectDeck`, `handleBreakdownCard` |
| Cosmetics | 1152–1210 | `handlePurchaseBorder`, `handleSelectBorder`, `handleEquipTheme` |
| Battle lifecycle | 1458–1548 | `openScreen`, `resetBattleState`, `handleResumeBattle`, `handleAbandonBattle`, `handleLeaveBattle`, `handleClaimDailyReward` |
| Admin | 1617–1858 | `refreshAdminOverview`, `refreshAdminUsers`, `refreshAdminAudit`, `handleSetUserRole`, `handleTransferOwnership`, `handleSubmitComplaint`, `handleSaveAdminSettings`, `handleUpdateComplaintStatus` |
| Match start | 1887–1942 | `startMatch`, `handleModeChange`, `handleAIDifficultyChange`, `handleOpenPack` |
| Social | 1976–2298 | `handleAddFriend`, `handleRemoveFriend`, `handleChallengeFriend`, `handleAcceptChallenge`, `handleDeclineChallenge`, `handleCancelOutgoingChallenge`, `handleProposeTrade`, `addTradeChip`, `removeTradeChip`, `handleTradeAction`, `handleCreateClan`, `handleJoinClan`, `handleLeaveClan` |
| App-level | 2298–2349 | `handleInstallApp`, `handleAcceptUpdate`, `handleDismissUpdate`, `handleStartQueue`, `handleCancelQueue`, `handleAcceptQueue` |
| Deckbuilder + battle actions | 2422–2528 | `handleDeckCount`, `handleQuickBattle`, `emitAction`, `handlePlayCard`, `handleSelectAttacker`, `handleAttackTarget`, `handleBurst`, `clearEnemyTurnTimers`, `handleEndTurn` |

### JSX Render Tree (Lines ~2596–3008)

```
<AppShellContext.Provider value={appCtx}>
  <main>
    <ToastStack toasts={toastStack} />
    <ConfirmModal ... />
    <CardInspectModal ... />
    <TopBar ... />
    <BattleIntroOverlay ... />
    <RewardOverlay ... />

    {loggedIn && (<>
      <HomeScreen />          ← reads useAppShell()/useProfile()
      <PlayScreen />          ← reads useGame()/useQueue()
      <CollectionScreen />    ← reads useProfile()/useGame()
      <BattleScreen />        ← reads useGame()
      <SocialScreen />        ← reads useSocial()/useProfile()
      <ShopScreen />          ← reads useProfile()
      <SettingsScreen />      ← reads useAppShell()
      <NavBar activeScreen={activeScreen} ... />
    </>)}
  </main>
</AppShellContext.Provider>
```

All screens stay mounted; only the active one is visible (CSS class toggle).

---

## `src/types.ts` (252 lines)

UI-only type definitions (game-engine types live in `src/game.ts`). Includes:
- Screen / auth: `AppScreen`, `AuthScreen`, `QueueState`, `BattleKind`, `CosmeticTheme`, `CardBorder`
- Server data: `ServerProfile`, `LeaderboardEntry`, `QueuePresence`, `QueueSearchStatus`, `OpponentProfile`
- Cards: `CardCollection`, `PackOffer`, `OpenedPackCard`, `InspectedCard`
- Social: `SocialFriend`, `SocialClan`, `SocialClanMember`, `Trade`, `TradeItem`, `OutgoingChallenge`, `IncomingChallenge`
- Admin: `AdminOverview`, `AdminUser`, `AdminAuditEntry`
- Forms: `ComplaintFormState`, `InstallPromptEvent`, `SavedDeck`, `ToastEntry`, `ConfirmRequest`

---

## `src/constants.ts` (182 lines)

Pure data constants (no functions, no side effects):
- `ARENA_URL` — API base URL (env override)
- `STORAGE_KEYS` — localStorage key map
- `DECK_PRESETS` — 4 curated AI deck templates
- `DECK_MAX_TOTAL_DISPLAY` — UI-shown max size
- `THEME_OFFERS` — 3 cosmetic themes
- `CARD_BORDER_OFFERS` — 5 card border cosmetics
- `AI_DIFFICULTY_OPTIONS` — Difficulty selector
- `EFFECT_LABELS` / `EFFECT_DESCRIPTIONS` — Card effect text
- `CARD_ART_ALIASES` — Fallback image mappings

---

## `src/utils.ts` (134 lines)

Pure helper functions:
- `readStoredValue<T>` — Safe localStorage read
- `createAnonymousId()` — Guest ID
- `getDeviceFingerprint()` — Device fingerprint
- `authFetch()` — Fetch with Bearer token
- `getScreenBucket()` — Viewport → mobile/tablet/desktop
- `formatTimestamp()` — ISO → locale string
- `cardArtPath()` / `handleCardArtError()` — Card art paths + fallback
- `pulseFeedback()` — Haptic vibration
- `makeLobbyCode()` — Random 4-char code
- `getRankLabel()` — Rating → rank tier

---

## `src/screens/`

All screens are propless and consume app state via the typed slice hooks
from `src/contexts/` (e.g. `const { game, handlePlayCard } = useGame()`).
None of them hold local app state. Each is wrapped in a
`<section className="... screen-panel ${active ? 'active' : 'hidden'}">`
so it can stay mounted.

| Screen | Lines | Notes |
|--------|-------|-------|
| `HomeScreen.tsx` | 80 | Main menu — welcome, optional resume-battle banner, 5 nav tiles, daily quest checklist |
| `PlayScreen.tsx` | 141 | Mode switch (AI/duel), AI difficulty, start/queue buttons, opponent preview |
| `SocialScreen.tsx` | 382 | Profile badges, leaderboard, friends list, clan, card trading panel |
| `CollectionScreen.tsx` | 282 | Saved decks roster, builder filters, mana curve, quick-battle presets |
| `BattleScreen.tsx` | 346 | Returns a `<>` fragment containing 6 sibling sections: enemy-turn-banner, connection banners, battle-topbar, battlefield, summary-card, hand-section |
| `ShopScreen.tsx` | 288 | Daily reward, themes, borders, packs, breakdown |
| `SettingsScreen.tsx` | 554 | Privacy + complaint form + admin console (overview, users, audit, role transfer) |

---

## `src/components/`

Small reusable UI primitives. All prop-driven, no app state.

| Component | Lines | Props | Notes |
|-----------|-------|-------|-------|
| `ToastStack.tsx` | 18 | `toasts` | Renders the 4-most-recent toast queue |
| `ConfirmModal.tsx` | 61 | `request`, `textInput`, callbacks | Generic confirm with optional text input |
| `CardInspectModal.tsx` | 55 | `card`, `onClose` | Long-press card detail (uses EFFECT_LABELS/DESCRIPTIONS internally) |
| `NavBar.tsx` | 46 | `activeScreen`, `isAdminRole`, `onNavigate` | Bottom 5-tab nav |
| `TopBar.tsx` | 48 | `screenTitle`, `serverProfile`, callbacks | Header (logo, sound, install, logout) |
| `BattleIntroOverlay.tsx` | 23 | `visible`, `game` | "Battle starting" splash |
| `RewardOverlay.tsx` | 66 | `visible`, `winner`, `mode`, callbacks | Post-battle reward modal (winner uses `GameState['winner']` to support 'draw') |

---

## `src/AppShellContext.ts`

- **`AppShellContext.ts`** — declares the slim `AppShellContextValue` type for the concerns that still genuinely belong to `AppShell`: auth/setup, navigation/UI shell, live-service banners, complaints/admin, plus cross-provider handlers and derived values.
- Game/profile/social/queue runtime state now lives in their dedicated provider files under `src/contexts/`.
- The slice hooks are the public screen API; no legacy `useApp()` facade remains.

---

## Conventions

- **No app state below App.tsx.** Screens read context, components read props — neither holds shared state.
- **Effects only in App.tsx.** Network calls, socket setup, persistence, and timers all live in App.tsx.
- **Game engine is the source of truth for cards/combat.** UI never duplicates game logic.
- **Long-press inspect** is wired through `getLongPressProps(card)` from the context and used by BattleScreen.
