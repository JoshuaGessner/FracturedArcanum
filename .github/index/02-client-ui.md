# Client UI Index

The client UI was extracted from a 5,188-line monolith into a root file plus screens/components/types/constants/utils modules. App-wide state is provided via React Context (`AppContext` + `useApp()`); screens call `useApp()` to pull the slice they need.

## File Structure

```
src/
├── App.tsx                    (2,896 lines)  Root: state, effects, handlers, context provider, JSX wiring
├── AppContext.ts              (275)          AppContextValue type + createContext
├── useApp.ts                  (10)           useApp() hook
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
└── screens/                                 5 main app screens (consume useApp() context)
    ├── HomeScreen.tsx
    ├── DeckScreen.tsx
    ├── BattleScreen.tsx
    ├── VaultScreen.tsx
    └── OpsScreen.tsx
```

---

## `src/App.tsx` (2,896 lines)

Root component. Owns ALL state via `useState`/`useRef`, ALL effects, ALL handler functions. Just before its JSX return it builds an `AppContextValue` object literal and wraps the entire `<main>` tree in `<AppContext.Provider value={appCtx}>`. Screens consume that context via `useApp()`.

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
| App-level | 2298–2349 | `handleInstallApp`, `handleAcceptUpdate`, `handleDismissUpdate`, `handleSendEmote`, `handleStartQueue`, `handleCancelQueue`, `handleAcceptQueue` |
| Deckbuilder + battle actions | 2422–2528 | `handleDeckCount`, `handleQuickBattle`, `emitAction`, `handlePlayCard`, `handleSelectAttacker`, `handleAttackTarget`, `handleBurst`, `clearEnemyTurnTimers`, `handleEndTurn` |

### JSX Render Tree (Lines ~2596–3008)

```
<AppContext.Provider value={appCtx}>
  <main>
    <ToastStack toasts={toastStack} />
    <ConfirmModal ... />
    <CardInspectModal ... />              (when inspectedCard set)
    <TopBar ... />
    <BattleIntroOverlay ... />
    <RewardOverlay ... />

    {loggedIn && (<>
      <HomeScreen />          ← reads useApp()
      <DeckScreen />          ← reads useApp()
      <BattleScreen />        ← reads useApp()
      <VaultScreen />         ← reads useApp()
      <OpsScreen />           ← reads useApp()
      <NavBar activeScreen={activeScreen} ... />
    </>)}
  </main>
</AppContext.Provider>
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
- `QUICK_EMOTES` — 5 reaction buttons
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

All screens are propless and consume app state via `const { ... } = useApp()`. None of them hold local app state. Each is wrapped in a `<section className="... screen-panel ${active ? 'active' : 'hidden'}">` so it can stay mounted.

| Screen | Lines | Notes |
|--------|-------|-------|
| `HomeScreen.tsx` | 534 | Largest screen — lobby, queue, mode switch, profile, leaderboard, social hub, friends, clan, trades, emotes |
| `OpsScreen.tsx` | 554 | Privacy + complaint form + admin console (overview, users, audit, role transfer) |
| `BattleScreen.tsx` | 346 | Returns a `<>` fragment containing 6 sibling sections: enemy-turn-banner, connection banners, battle-topbar, battlefield, summary-card, hand-section |
| `DeckScreen.tsx` | 282 | Saved decks roster, builder filters, mana curve, quick-battle presets |
| `VaultScreen.tsx` | 288 | Daily reward, themes, borders, packs, breakdown |

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

## `src/AppContext.ts` + `src/useApp.ts`

- **`AppContext.ts`** — declares the `AppContextValue` type (every state slice and handler exposed to screens) and creates the React context. The type is grouped by domain: auth/setup, profile, decks/collection, cosmetics/shop, navigation/UI shell, live service, queue/matchmaking, battle/game, social, trading, settings/admin/complaints.
- **`useApp.ts`** — a tiny `useApp()` hook that reads the context and throws if used outside `<AppContext.Provider>`.

App.tsx is the sole provider. Each screen imports `useApp` and pulls only the keys it needs. The split into 2 files (type+context, hook) is required by ESLint's `react-refresh/only-export-components` rule.

---

## Conventions

- **No app state below App.tsx.** Screens read context, components read props — neither holds shared state.
- **Effects only in App.tsx.** Network calls, socket setup, persistence, and timers all live in App.tsx.
- **Game engine is the source of truth for cards/combat.** UI never duplicates game logic.
- **Long-press inspect** is wired through `getLongPressProps(card)` from the context and used by BattleScreen.
