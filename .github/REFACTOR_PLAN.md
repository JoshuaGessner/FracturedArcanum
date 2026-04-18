# Fractured Arcanum — Full Refactor & Redesign Plan

> Generated 2026-04-17. Reference this file at the start of the implementation session.
> **Current state:** App.tsx = 2,905 lines, provider tree + AppShellContext composition are fully live, 7 renamed screens and 8 shared components are in place, the SVG asset pipeline is verified, and tests/lint/build are green. Completed structural items are intentionally condensed so this plan stays focused on the remaining UI polish and live-service stability work.

---

## Phase 1 — Context Split (5 providers, zero visual change)

**Goal:** Move state + handlers out of App.tsx into 5 focused context providers. App.tsx becomes a thin shell (~200-400 lines) that composes providers and mounts screens.

### 1A. Create `src/contexts/` directory with 5 context files

Each file exports: a `*ContextValue` type, a `createContext`, a `use*()` hook, and a `*Provider` component.

#### `src/contexts/AppContext.tsx` — Auth, socket, toast, confirm, navigation, analytics, maintenance

**State to move from App.tsx:**
- `authToken`, `authScreen`, `authForm`, `authError`, `authLoading`, `loggedIn`
- `setupRequired`, `setupForm`, `setupError`, `setupLoading`
- `serverProfile` (shared — read by Profile/Social, written here)
- `toastMessage`, `toastSeverity`, `toastStack`
- `confirmRequest`, `confirmTextInput`
- `backendOnline`, `motd`, `dailyQuest`, `featuredMode`, `maintenanceMode`
- `soundEnabled`, `analyticsConsent`, `visitorId`, `sessionId`
- `installPromptEvent`, `swUpdateAvailable`
- `activeScreen`
- `complaintForm`, `complaintStatus`

**Refs:** `socketClientRef`, `swRegistrationRef`

**Handlers:**
- `handleSetup`, `handleAuth`, `handleLogout`
- `setToastMessage`, `inferToastSeverity`, `askConfirm`, `closeConfirm`
- `openScreen`, `sendAnalytics`
- `handleInstallApp`, `handleAcceptUpdate`, `handleDismissUpdate`
- `handleSubmitComplaint`

**Effects:**
- Auth restore on mount (L301-321)
- Setup status check (L323-334)
- localStorage persistence for auth, sound, analytics, visitor (subset of L739-752)
- Install prompt (L1096-1113)
- SW update detection (L1115-1122)
- Analytics page view (L828-839)

**Exposed values (~45 keys):** auth*, setup*, serverProfile, setServerProfile, toast*, confirm*, activeScreen, openScreen, screenTitle, soundEnabled, setSoundEnabled, analyticsConsent, setAnalyticsConsent, backendOnline, dailyQuest, featuredMode, visitorId, installPromptEvent, swUpdateAvailable, handle*, complaint*, sendAnalytics, socketClientRef

---

#### `src/contexts/GameContext.tsx` — Battle state, game actions, AI animation

**State to move:**
- `game`, `selectedAttacker`, `enemyTurnActive`, `enemyTurnLabel`
- `preferredMode`, `aiDifficultySetting`, `lobbyCode`
- `battleKind`, `battleSessionActive`, `serverBattleActive`
- `opponentDisconnected`, `disconnectGraceMs`
- `battleIntroVisible`, `rewardOverlayVisible`
- `damagedSlots`, `inspectedCard`
- `deckConfig` (shared — also needed by ProfileContext for deck builder)

**Refs:** `enemyTurnTimers`, `prevBoardRef`, `battleStartedRef`, `battleIntroTimerRef`, `longPressTimerRef`, `longPressTriggeredRef`, `resolvedMatchKeyRef`

**Handlers:**
- `startMatch`, `handleModeChange`, `handleAIDifficultyChange`, `handleQuickBattle`
- `handlePlayCard`, `handleSelectAttacker`, `handleAttackTarget`, `handleBurst`, `handleEndTurn`
- `resetBattleState`, `handleResumeBattle`, `handleAbandonBattle`, `handleLeaveBattle`
- `handleSendEmote`, `emitAction`, `clearEnemyTurnTimers`
- `clearLongPressTimer`, `consumeLongPressAction`, `inspectCard`, `getLongPressProps`
- `triggerBattleIntro`

**Effects:**
- Long-press cleanup (L734-737)
- localStorage for deck, mode, AI difficulty (subset of L739-752)
- Battle intro visibility toggle (L811-826)
- Damage animation detection (L841-873)
- Win/loss sounds + reward overlay (L875-891)
- Match completion + stats sync (L893-936)

**Derived state:** `isRankedBattle`, `isLocalPassBattle`, `hasBattleInProgress`, `gameInProgress`, `activePlayer`, `defendingPlayer`, `isMyTurn`, `defenderHasGuard`, `activeBoardHasOpenLane`, `resolvedAIDifficulty`

**Dependencies on other contexts:**
- Reads `socketClientRef` from AppContext (for `emitAction`)
- Reads `authToken`, `serverProfile`, `setServerProfile` from AppContext (for match completion sync)
- Reads `sendAnalytics` from AppContext
- Reads `setToastMessage` from AppContext
- Reads `openScreen` from AppContext (for navigation after battle)

**Exposed values (~40 keys)**

---

#### `src/contexts/ProfileContext.tsx` — Decks, collection, cosmetics, economy

**State to move:**
- `savedDecks`, `activeDeckId`, `builderFilter`, `pendingBreakdown`
- `collection`, `packOffers`, `openedPackCards`, `packOpening`

**Handlers:**
- `reloadDecks`, `handleCreateDeck`, `handleRenameDeck`, `handleDeleteDeck`, `handleSelectDeck`
- `handleBreakdownCard`, `handleDeckCount`
- `handleOpenPack`, `handlePurchaseBorder`, `handleSelectBorder`
- `handleClaimDailyReward`, `handleEquipTheme`

**Effects:**
- Deck config sync debounced (L754-767)
- Saved decks load on login (L769-797)
- Initial collection/packs load (subset of L686-720)

**Dependencies:**
- Reads `authToken`, `serverProfile`, `setServerProfile` from AppContext
- Reads/writes `deckConfig` (shared with GameContext — put in ProfileContext, GameContext reads it)
- Reads `setToastMessage` from AppContext

**Derived state:** `selectedDeckSize`, `deckReady`, `runes`, `seasonRating`, `record`, `ownedThemes`, `selectedTheme`, `ownedCardBorders`, `selectedCardBorder`, `lastDailyClaim`, `accountRole`, `isAdminRole`, `isOwnerRole`, `rankLabel`, `totalGames`, `winRate`, `rankProgress`, `nextRankTarget`, `nextRewardLabel`, `todayKey`, `canClaimDailyReward`, `totalOwnedCards`

> Note: Many derived values come from `serverProfile`. They could stay as inline computations or be memoized in ProfileContext.

**Exposed values (~35 keys)**

---

#### `src/contexts/SocialContext.tsx` — Friends, clan, trades, challenges

**State to move:**
- `friends`, `onlineFriendIds`, `outgoingChallenge`, `incomingChallenge`, `challengeStatus`
- `trades`, `tradesTick`, `tradeStatus`, `tradeForm`, `tradePickerDraft`, `tradeSubmitting`
- `nowTick`, `clan`, `socialLoading`, `socialStatus`, `friendUsernameInput`, `clanForm`

**Handlers:**
- `refreshSocialHub`, `handleAddFriend`, `handleRemoveFriend`
- `handleChallengeFriend`, `handleAcceptChallenge`, `handleDeclineChallenge`, `handleCancelOutgoingChallenge`
- `handleCreateClan`, `handleJoinClan`, `handleLeaveClan`
- `refreshTrades`, `handleProposeTrade`, `addTradeChip`, `removeTradeChip`, `formatCountdown`, `handleTradeAction`

**Effects:**
- Initial social load (subset of L686-720)
- Time ticker for countdown (L1124-1127)
- Trades auto-refresh (L1232-1243)

**Dependencies:**
- Reads `authToken`, `socketClientRef` from AppContext
- Reads `setToastMessage` from AppContext
- Reads `collection` from ProfileContext (for trade card picker)

**Exposed values (~30 keys)**

---

#### `src/contexts/QueueContext.tsx` — Matchmaking, queue UI, leaderboard

**State to move:**
- `queueState`, `queueSeconds`, `queuedOpponent`
- `leaderboardEntries`, `queuePresence`, `queueSearchStatus`

**Handlers:**
- `handleStartQueue`, `handleCancelQueue`, `handleAcceptQueue`

**Effects:**
- Queue timer tick (L722-732)
- Queue matched sound (L805-809)
- Live arena refresh (L649-684)

**Dependencies:**
- Reads `authToken`, `socketClientRef` from AppContext
- Reads `setToastMessage`, `sendAnalytics` from AppContext
- Calls `startMatch` from GameContext when match accepted

**Derived state:** `liveQueueLabel`

**Exposed values (~12 keys)**

---

### 1B. Socket.IO event wiring

The current mega-effect (L356-647) handles events for ALL contexts. Strategy:

1. **AppContext** owns the Socket.IO client creation and connection lifecycle.
2. AppContext exposes `socketClientRef` to other providers.
3. Each context registers its own socket event listeners in its own useEffect:
   - GameContext: `game:state`, `game:action-ack`, `game:error`, `game:emote`
   - SocialContext: `challenge:incoming`, `challenge:accepted`, `challenge:declined`, `challenge:cancelled`, `friend:presence`, `trade:incoming`, `trade:updated`
   - QueueContext: `queue:matched`, `queue:status`, `queue:presence`
   - AppContext: `server:hello`, `role:changed`, `connect`, `disconnect`

4. The `server:hello` handler (which fetches MOTD, profile, friends) triggers initial loads. AppContext handles this, then each context reads its own data via its own fetch-on-login effect.

### 1C. Provider nesting order in App.tsx

```tsx
<AppProvider>          {/* auth, socket, toast, navigation */}
  <ProfileProvider>    {/* decks, collection, cosmetics — needs authToken */}
    <GameProvider>     {/* battle state — needs socket, deckConfig */}
      <SocialProvider> {/* friends, clan, trades — needs socket, collection */}
        <QueueProvider>{/* matchmaking — needs socket, startMatch */}
          <AppShell />
        </QueueProvider>
      </SocialProvider>
    </GameProvider>
  </ProfileProvider>
</AppProvider>
```

### 1D. Update `src/AppContext.ts`

- Delete monolithic `AppContextValue` (275 lines)
- This file becomes a barrel or is replaced by `src/contexts/AppContext.tsx`

### 1E. Update `src/useApp.ts`

Either keep as a convenience hook that combines all 5 contexts, or deprecate in favor of specific hooks (`useGame()`, `useProfile()`, `useSocial()`, `useQueue()`, `useAppContext()`).

**Migration strategy for screens:** Initially, keep `useApp()` as a facade that merges all 5 context values. Screens keep working unchanged. Then gradually migrate each screen to use specific hooks.

### 1F. Validation

- `npm run build` passes
- `npm test` passes (45/45)
- `npm run lint` passes
- No visual change — app works identically
- Bundle size delta < 5%

### 1G. Remove quick-emote reaction buttons

The emote-row buttons (⚡🔥✨🛡️😈) below the trading section on the Home screen add no gameplay value. Remove the entire feature:

| File | What to remove |
|------|---------------|
| `src/screens/HomeScreen.tsx` | Delete the `.emote-row` div block (L525-530) and `handleSendEmote` from the `useApp()` destructure (L49) |
| `src/App.tsx` | Delete `handleSendEmote` function (~L2331-2348) and the `room:emote` socket listener (~L753-759). Remove `handleSendEmote` from the `appCtx` object (~L2640) |
| `src/AppContext.ts` | Remove `handleSendEmote` from `AppContextValue` type |
| `src/constants.ts` | Delete `QUICK_EMOTES` array (L88) |
| `src/App.css` | Delete `.emote-row` and `.emote-chip` styles |
| `server/server.js` | Delete `room:emote` socket handler (~L2128-2135) and `emotes` analytics counter references (~L295, L645-646) |

After removal: build, test, lint must all pass. The `room:emote` socket event becomes dead — no client emits it, no server listens for it.

---

## Phase 2 — Screen Rename & Split (5 → 7 screens)

**Goal:** Restructure screens to match the planned 7-screen architecture. One screen at a time, test after each.

### 2A. Update `AppScreen` type

```typescript
// src/types.ts
type AppScreen = 'main-menu' | 'play' | 'collection' | 'social' | 'shop' | 'battle' | 'settings'
```

Update all references: NavBar, AppContext `openScreen`, TopBar `screenTitle` mapping, CSS classes.

### 2B. Screen-by-screen extraction order (lowest risk first)

#### Step 1: OpsScreen → SettingsScreen

- Rename `src/screens/OpsScreen.tsx` → `src/screens/SettingsScreen.tsx`
- Keep all content (privacy, complaints, admin console)
- Admin console stays role-gated inside SettingsScreen
- Update `AppScreen` reference from `'ops'` → `'settings'`
- Update NavBar: `📊 Ops` → `⚙️ Settings` (always visible, not admin-gated)
- CSS: rename `.ops-*` selectors if any

#### Step 2: VaultScreen → ShopScreen

- Rename `src/screens/VaultScreen.tsx` → `src/screens/ShopScreen.tsx`
- Keep: pack catalog, theme offers, card border offers, daily reward claim
- Move OUT to CollectionScreen (Step 4): card breakdown/disenchant section, collection stats
- Update `AppScreen` from `'vault'` → `'shop'`
- Update NavBar: `💎 Vault` → `🛒 Shop`

#### Step 3: DeckScreen → CollectionScreen

- Rename `src/screens/DeckScreen.tsx` → `src/screens/CollectionScreen.tsx`
- Keep: deck roster, deck builder, card grid with filters, mana curve, quick battle presets
- Add IN from VaultScreen: card breakdown/disenchant, collection stats badge
- Update `AppScreen` from `'deck'` → `'collection'`
- Update NavBar: `🃏 Deck` → `📚 Collection`

#### Step 4: HomeScreen → split into MainMenuScreen + PlayScreen + SocialScreen

This is the biggest change. HomeScreen (598 lines) contains 7 content sections.

**4a. Create `src/screens/SocialScreen.tsx`**
Move from HomeScreen:
- Profile stats badge section
- Leaderboard section
- Social hub (friends list, add friend, challenges, online indicators)
- Clan management (create, join, leave)
- Card trading (propose, accept/reject, trade picker, countdown)

Approximate size: ~350-400 lines

**4b. Create `src/screens/PlayScreen.tsx`**
Move from HomeScreen:
- Mode selection (AI vs Duel toggle)
- AI difficulty selector
- Resume battle panel
- Queue controls (Start Queue, Cancel, Accept)
- Queue status display (position, wait time, rating window)
- Live arena presence info
- Start Battle / Quick Battle buttons

Approximate size: ~200-250 lines

**4c. Slim HomeScreen → `src/screens/MainMenuScreen.tsx`**
Rename HomeScreen.tsx → MainMenuScreen.tsx
Keep only:
- Season progress display
- Daily quest banner
- Navigation tiles to Play, Collection, Social, Shop
- Featured mode announcement

Approximate size: ~150-200 lines

#### Step 5: BattleScreen stays

- No structural change needed
- Update `activeScreen === 'battle'` checks (already correct)

### 2C. Update NavBar for 6 tabs

```tsx
// Bottom nav tabs (battle hides the entire bar)
🏠 Home → MainMenuScreen ('main-menu')
⚔️ Play → PlayScreen ('play')
📚 Collection → CollectionScreen ('collection')
👥 Social → SocialScreen ('social')
🛒 Shop → ShopScreen ('shop')
⚙️ Settings → SettingsScreen ('settings')
```

Battle screen: hide NavBar entirely when `activeScreen === 'battle'`.

### 2D. Validation (after each step)

- Build, test, lint pass
- All navigation works
- No broken imports
- Screen content renders correctly

---

## Phase 3 — Asset Generation & Gamified UI Redesign

**Goal:** Generate every visual asset the game needs (backgrounds, UI chrome, icons, overlays, rank insignia, particle textures, pack art) so no screen relies on browser-default elements, plain text labels, or unstyled controls. Every surface should feel like an in-game panel — not a web page.

---

### 3A. Asset Generation — Extend `scripts/generate-brand-assets.mjs`

The existing generator (734 lines) already produces 89 card SVGs, 4 UI banners, hero portraits, logo, crest, board background, and card template. Extend it with every new asset needed below.

All assets go to `public/generated/ui/` and are registered in `asset-manifest.json`.

#### 3A-1. Screen Backgrounds (7 assets)

Every screen gets a unique full-bleed background — no plain CSS `background-color`.

| Asset | File | Description |
|-------|------|-------------|
| Main Menu BG | `bg-main-menu.svg` | Deep midnight sky with layered mountain silhouettes, aurora shimmer at top, subtle floating rune particles. Central clearing for nav tiles. |
| Play BG | `bg-play.svg` | Arena coliseum interior — stone archways framing a central portal circle. Torchlight warmth from edges. |
| Collection BG | `bg-collection.svg` | Grand library interior — bookshelves receding into fog, floating spell pages, warm lantern pools. |
| Social BG | `bg-social.svg` | Tavern great hall — long oak table in perspective, banners hanging from rafters, fireplace glow on left. |
| Shop BG | `bg-shop.svg` | Merchant wagon / bazaar stall — draped purple and gold fabrics, mysterious crates and potion bottles, lantern strings. |
| Battle BG | `bg-battle.svg` | Already exists as `fractured-arcanum-board.svg` — polish with lane grid lines, rune-circle center, torch pillars at edges. |
| Settings BG | `bg-settings.svg` | Scribe's workshop — parchment, quills, wax seals, dark wood desk. Calm and functional. |

Each background SVG should be 1440×900 viewBox, layered gradients + shapes (no raster), optimized for CSS `background-image` stretching.

#### 3A-2. Navigation Tile Art (6 assets)

Main menu "tavern door" tiles — each one an illustrated card-shaped tile, not an emoji label.

| Asset | File | Description |
|-------|------|-------------|
| Play tile | `tile-play.svg` | Crossed swords over a glowing portal ring |
| Collection tile | `tile-collection.svg` | Open spell tome with floating card pages |
| Social tile | `tile-social.svg` | Two heraldic shields overlapping (alliance crest) |
| Shop tile | `tile-shop.svg` | Treasure chest with gold light spilling out |
| Settings tile | `tile-settings.svg` | Mechanical gear with arcane rune inlay |
| Battle tile | `tile-battle.svg` | War banner with crest (for "Resume Battle" state) |

Each tile: 240×320 viewBox, gradient background panel + illustrated foreground element + subtle vignette border.

#### 3A-3. Rank Insignia (4 assets)

Replace text-only rank labels with visual crests.

| Rank | File | Description |
|------|------|-------------|
| Bronze | `rank-bronze.svg` | Tarnished bronze shield, simple crossed-blade icon |
| Silver | `rank-silver.svg` | Polished silver kite shield, single wing ornament |
| Gold | `rank-gold.svg` | Golden sunburst shield, laurel wreath frame |
| Diamond | `rank-diamond.svg` | Prismatic diamond crest, radiating light rays, crown |

Each insignia: 120×120 viewBox. Used in leaderboard podium, profile badges, post-match overlay, TopBar.

#### 3A-4. Pack Art (3 assets)

Packs in the shop need illustrated covers, not icon text.

| Pack | File | Description |
|------|------|-------------|
| Standard Pack | `pack-standard.svg` | Wax-sealed card bundle wrapped in brown leather, blue arcane glow |
| Premium Pack | `pack-premium.svg` | Gilded envelope with purple energy seeping from edges |
| Legendary Pack | `pack-legendary.svg` | Golden chest with keyhole, bright golden rays escaping cracks |

Each: 200×280 viewBox. Used in ShopScreen grid, pack opening ceremony pre-flip.

#### 3A-5. Rarity Gem Icons (4 assets)

Replace rarity text badges with gem icons.

| Rarity | File | Color |
|--------|------|-------|
| Common | `gem-common.svg` | Gray quartz |
| Rare | `gem-rare.svg` | Blue sapphire |
| Epic | `gem-epic.svg` | Purple amethyst |
| Legendary | `gem-legendary.svg` | Orange amber with inner fire |

Each: 32×32 viewBox. Used in card corners, collection browser filter pills, pack reveal glow color.

#### 3A-6. UI Chrome Elements (12 assets)

Replace all remaining plain HTML controls and dividers with game-themed elements.

| Asset | File | Use |
|-------|------|-----|
| Button frame (primary) | `btn-primary.svg` | 9-slice border for all primary action buttons — gold-trimmed stone slab |
| Button frame (ghost) | `btn-ghost.svg` | Subtle etched border, semi-transparent — secondary actions |
| Button frame (danger) | `btn-danger.svg` | Cracked red stone frame — destructive actions |
| Panel frame | `panel-frame.svg` | Ornate 9-slice border for section cards — dark wood + gold corner rivets |
| Divider line | `divider-rune.svg` | Horizontal ornamental divider with center rune knot |
| Mana pip (empty) | `pip-mana-empty.svg` | Hollow blue crystal |
| Mana pip (filled) | `pip-mana-filled.svg` | Glowing blue crystal |
| Momentum pip (empty) | `pip-momentum-empty.svg` | Hollow amber orb |
| Momentum pip (filled) | `pip-momentum-filled.svg` | Flaming amber orb |
| Health heart | `icon-health.svg` | Red crystal heart |
| Attack sword | `icon-attack.svg` | Silver blade |
| Shield (guard) | `icon-guard.svg` | Blue tower shield with rune |

Each designed to tile/scale. Buttons use CSS `border-image` or `mask-image` with the SVG as source.

#### 3A-7. Effect Icons (20 assets)

Replace emoji-based effect labels (⚡ Charge, 🛡️ Guard, etc.) with hand-drawn-style ability icons.

| Effect | File | Visual |
|--------|------|--------|
| charge | `fx-charge.svg` | Lightning bolt striking down |
| guard | `fx-guard.svg` | Raised tower shield |
| rally | `fx-rally.svg` | War horn with sound waves |
| blast | `fx-blast.svg` | Explosion burst |
| heal | `fx-heal.svg` | Green plus with leaf vines |
| draw | `fx-draw.svg` | Glowing card being pulled from deck |
| fury | `fx-fury.svg` | Flame-wrapped fist |
| drain | `fx-drain.svg` | Dripping dark orb |
| empower | `fx-empower.svg` | Upward golden arrows |
| poison | `fx-poison.svg` | Skull with drip |
| shield | `fx-shield.svg` | Layered armor plates |
| siphon | `fx-siphon.svg` | Two-way energy stream |
| bolster | `fx-bolster.svg` | Wave cresting upward |
| cleave | `fx-cleave.svg` | Wide axe swing arc |
| lifesteal | `fx-lifesteal.svg` | Fanged orb absorbing red mist |
| summon | `fx-summon.svg` | Portal with emerging silhouette |
| silence | `fx-silence.svg` | Broken rune circle |
| frostbite | `fx-frostbite.svg` | Snowflake with icicle spikes |
| enrage | `fx-enrage.svg` | Cracked red eye |
| deathrattle | `fx-deathrattle.svg` | Cracked skull with soul wisp |

Each: 40×40 viewBox. Replace `EFFECT_LABELS` emoji usage in `CardInspectModal`, `BattleScreen`, `CollectionScreen`.

#### 3A-8. Overlay & Ceremony Assets (8 assets)

| Asset | File | Use |
|-------|------|-----|
| VS splash | `overlay-vs.svg` | Large ornate "VS" lettering with crossed swords — battle intro |
| Victory banner | `overlay-victory.svg` | Golden banner unfurling with "VICTORY" in fantasy font |
| Defeat banner | `overlay-defeat.svg` | Tattered dark banner with "DEFEAT" stamped in red |
| Draw banner | `overlay-draw.svg` | Neutral stone tablet with "DRAW" carved in |
| Pack glow (common) | `glow-common.svg` | Soft gray radial burst |
| Pack glow (rare) | `glow-rare.svg` | Blue radial burst |
| Pack glow (epic) | `glow-epic.svg` | Purple radial burst with sparkle |
| Pack glow (legendary) | `glow-legendary.svg` | Golden explosion burst with rays |

#### 3A-9. Particle Textures (4 assets)

Small tileable/animatable elements for ambient motion.

| Asset | File | Use |
|-------|------|-----|
| Rune particle | `particle-rune.svg` | Tiny floating arcane glyph — main menu ambient |
| Ember particle | `particle-ember.svg` | Small glowing ember dot — ember theme, battle |
| Dust mote | `particle-dust.svg` | Soft circular mote — collection library ambiance |
| Frost shard | `particle-frost.svg` | Tiny ice crystal — frost theme, frostbite effect |

Each: 16×16 viewBox. Animated via CSS `@keyframes` with randomized `animation-delay` on multiple `<img>` or pseudo-elements.

#### 3A-10. Sound Expansion — `src/audio.ts`

Current: 7 sounds (tap, summon, attack, burst, match, win, lose). Add:

| Sound | Trigger | Synthesis |
|-------|---------|-----------|
| `navigate` | Screen transition | Quick ascending two-note chime (C5→E5, triangle, 80ms) |
| `packOpen` | Pack lid opens | Deep thud + ascending shimmer sweep (sine 80Hz→sawtooth 800Hz, 400ms) |
| `cardReveal` | Each card flips in pack | Quick bright ting (triangle 880Hz, 60ms) |
| `legendaryReveal` | Legendary card revealed | Extended golden fanfare (C5→E5→G5→C6, triangle, 600ms) |
| `rankUp` | Post-match rank increase | Rising three-note triumph (F4→A4→C5, triangle, 300ms) |
| `questComplete` | Quest goal reached | Warm double-chime (G4+B4 chord, sine, 200ms) |
| `error` | Failed action / validation | Low buzz (square 120Hz, 100ms) |
| `challenge` | Challenge received | Alert horn (sawtooth 440Hz→330Hz descending, 200ms) |
| `trade` | Trade proposal received | Coin clink (triangle 1200Hz, very short 40ms × 2) |
| `countdown` | Queue timer tick at 3/2/1 | Metronome tick (triangle 660Hz, 50ms) |

All synthesized via Web Audio API — no audio file downloads.

**Asset generation total: ~70 new SVGs** added to the generator.

Run `npm run assets:generate` after updating the script, then verify all assets appear in `asset-manifest.json`.

---

### 3B. Kill Every Browser-Default Element

Systematic removal of anything that looks like a web page:

#### Buttons
- No browser `<button>` with default border/bg. Every button gets a 9-slice SVG frame via `border-image` or a layered CSS background using generated button art.
- `:active` state: stone slab depresses (scale 0.97 + inner shadow shift + haptic).
- `:hover` / `:focus-visible`: gold border glow pulse, not a dotted outline.
- Disabled: desaturated + cracked stone overlay (CSS `filter: saturate(0.3) brightness(0.7)`).

#### Inputs
- Text inputs styled as parchment scroll strips — tan background, dark ink text, quill-cursor (`cursor: url(...)` or styled caret-color), no visible browser chrome.
- Dropdowns replaced with custom select panels (tap opens a scroll-style picker with options on parchment cards).
- Checkboxes replaced with rune toggles — inactive = dim rune circle, active = glowing rune with pulse.

#### Scrollbars
- Thin custom scrollbar (`scrollbar-width: thin; scrollbar-color: var(--accent) transparent`).
- On mobile: hide scrollbars entirely, rely on touch scroll with momentum.

#### Typography
- All headings use a fantasy display font (self-hosted, no Google Fonts CDN). Add to `public/fonts/`:
  - Primary display: A bold medieval/fantasy face for screen titles, victory text, VS splash (e.g., generate via SVG text paths if licensing is a concern).
  - Body: Keep existing system-ui stack but tighten letter-spacing for a sharper feel.
- Numbers in stats (health, attack, mana, runes) use tabular-nums + slightly larger weight for impact.

#### Section Cards
- Current `.section-card` is a semi-transparent rectangle. Replace with `panel-frame.svg` 9-slice border — dark ornate wood frame with gold corner rivets.
- Inner content sits on a subtle parchment-tone gradient, not pure transparent.

#### Dividers
- All `<hr>` and section boundaries use `divider-rune.svg` instead of a 1px line.

#### Loading States
- Current spinner is a CSS rotate animation. Replace with an animated rune circle — three concentric rings rotating at different speeds, arcane glyphs on each ring.

---

### 3C. Transition & Animation System

#### Screen Transitions
Add to App.css (new section: `/* ── Screen transitions ── */`):

```css
/* Forward nav: slide left + fade */
.screen-enter-forward { animation: slideInLeft 280ms var(--motion-base); }
.screen-exit-forward  { animation: slideOutLeft 280ms var(--motion-base); }

/* Back nav: slide right + fade */
.screen-enter-back    { animation: slideInRight 280ms var(--motion-base); }
.screen-exit-back     { animation: slideOutRight 280ms var(--motion-base); }

/* Lateral: cross-fade */
.screen-enter-lateral { animation: fadeIn 220ms var(--motion-base); }
.screen-exit-lateral  { animation: fadeOut 220ms var(--motion-base); }

/* Battle entry: zoom + whoosh */
.screen-enter-battle  { animation: zoomWhoosh 400ms var(--motion-slow); }

@media (prefers-reduced-motion: reduce) {
  [class*="screen-enter"], [class*="screen-exit"] {
    animation: none !important;
  }
}
```

Navigation logic in AppContext's `openScreen` determines direction:
- Forward: main-menu → play, main-menu → collection, etc.
- Back: play → main-menu, settings → main-menu
- Lateral: social ↔ shop, collection ↔ social
- Battle: any → battle (plays `navigate` sound + whoosh)

#### Micro-Animations (global)

| Animation | Trigger | Spec |
|-----------|---------|------|
| Button press spring | `:active` on any button | `scale(0.96)` → spring back 120ms + haptic `pulseFeedback(10)` |
| Card hover lift | `:hover` / `:focus` on card elements | `translateY(-6px)` + box-shadow increase + 160ms ease |
| Card play summon | Card leaves hand and enters board | `cardPlay` (existing) enhanced: slide up from hand position, scale 1.0→1.15→1.0, glow burst on land |
| Damage flash | Unit takes damage | `damageFlash` (existing) enhanced: red edge vignette, health number bounces, shake 3px |
| Death dissolve | Unit destroyed | `deathFade` (existing) enhanced: unit turns to particles (opacity dissolve + scale(0.7) + blur(4px)) |
| Toast slide | Toast appears/disappears | Slide in from right edge 200ms, auto-fade at 3s with 300ms opacity transition |
| Mana pip fill | Mana gained at turn start | Pip scales 1.0→1.3→1.0 with glow, 150ms stagger per pip |
| Count increment | Number changes (runes, health, stats) | Number animates via CSS counter + `@keyframes` or React transition: old number slides up and fades, new slides in from below |
| Streak fire | Win streak ≥ 3 | Persistent ember particles around streak badge |

All animations gated on `prefers-reduced-motion`: when `reduce`, disable all transforms/opacity transitions, keep functional state changes.

---

### 3D. Per-Screen Redesign — Full Specifications

#### MainMenuScreen — "The War Room"

**Background:** `bg-main-menu.svg` full-bleed. Ambient floating `particle-rune.svg` elements (8-12 particles, randomized position/delay, `ambientFloat` keyframes).

**Layout:**
```
┌──────────────────────────────────┐
│  Brand logo (centered, pulsing)  │
│  Season progress arc (below)     │
├──────────┬───────────┤
│ ⚔ Play   │ 📚 Collect │  ← 2×2 tile grid
├──────────┼───────────┤  Each tile = tile-*.svg art
│ 👥 Social │ 🛒 Shop   │  + label + notification dot
├──────────┴───────────┤
│  Quest banner (card style)       │
│  Featured mode callout           │
│  Resume battle banner (if active)│
└──────────────────────────────────┘
```

- **Nav tiles:** Each tile is a full illustrated card using `tile-*.svg` as background. On hover: lifts 8px, gold glow border pulses, play `tap` sound. On press: depresses, `navigate` sound, screen transition fires.
- **Season progress:** Circular arc (SVG `<circle>` with `stroke-dasharray`) around the crest, not a horizontal bar. Current rank insignia (`rank-*.svg`) centered inside the arc. Rating number below.
- **Quest banner:** Parchment-card style with quill icon, quest text, progress indicator (e.g., "1/3 wins"), and a glowing "Complete!" badge when done (plays `questComplete` sound on first render).
- **Resume battle:** If `hasBattleInProgress`, show a pulsing card with `tile-battle.svg` art and "Return to Battle" — tapping triggers `zoomWhoosh` transition.
- **No text walls, no bullet lists, no plain paragraphs.** Every piece of information lives inside a styled card or badge.

#### PlayScreen — "The Arena Gate"

**Background:** `bg-play.svg` full-bleed.

**Layout (idle):**
```
┌──────────────────────────────────┐
│  Three mode cards (horizontal)   │
│  ┌────────┬────────┬────────┐    │
│  │Solo    │Ranked  │Friend- │    │
│  │Arena   │Duel    │ly      │    │
│  │[art]   │[art]   │[art]   │    │
│  │        │        │        │    │
│  └────────┴────────┴────────┘    │
│  AI difficulty tier selector     │
│  (visual badges, not dropdown)   │
│  ─── rune divider ───            │
│  [Start Battle] button           │
│  Quick battle presets (small)    │
└──────────────────────────────────┘
```

- **Mode cards:** Three tall illustrated cards. Selected mode has gold border glow + slightly elevated. Unselected are dimmed (brightness 0.6). Tapping a card: spring scale animation + `tap` sound + mode switches.
- **AI difficulty:** Four tier badges in a row (Novice / Adept / Veteran / Legend) — each badge styled like a small rank insignia. "Auto" option is a separate rune toggle. Selected tier glows.
- **Queue searching state:** When queue starts, mode cards slide down and a **full-screen portal animation** takes over:
  - Central swirling vortex (CSS `conic-gradient` animating `rotate` + pulsing scale)
  - Ring of rune particles orbiting
  - Timer text in center: "Searching... 0:12"
  - Queue stats overlay: position, estimated wait, rating window
  - Cancel button at bottom (ghost style)
  - `countdown` sound at 3s, 2s, 1s before estimated match
- **Opponent found:** Portal collapses to center point → expands into VS splash:
  - `overlay-vs.svg` centered
  - Player name + rank insignia on left, opponent name + rank insignia on right
  - `match` sound plays
  - 2.5s hold → `zoomWhoosh` transition into BattleScreen
  - `challenge` sound for friend match variant

#### CollectionScreen — "The Arcane Library"

**Background:** `bg-collection.svg` full-bleed. Subtle `particle-dust.svg` floating.

**Layout:**
```
┌──────────────────────────────────┐
│  Deck roster (horizontal scroll) │
│  [+ New] [Deck1•] [Deck2] ...   │
│  ─── rune divider ───            │
│  Filter bar (sticky)             │
│  [All] [Common] [Rare] [Epic]   │
│  [Legendary] [🔍 search...]     │
│  ─── rune divider ───            │
│  Card browser (grid)             │
│  ┌─────┬─────┬─────┐            │
│  │card │card │card │  ← large   │
│  │art  │art  │art  │  previews  │
│  │+/-  │+/-  │+/-  │            │
│  └─────┴─────┴─────┘            │
│  ─── rune divider ───            │
│  Deck stats sidebar / footer     │
│  Mana curve · Card count · etc   │
│  ─── rune divider ───            │
│  Breakdown / Disenchant section  │
└──────────────────────────────────┘
```

- **Deck roster:** Horizontal scroll of deck "book spines" — each a narrow card with deck name rotated vertically, card count badge, active indicator (glowing clasp). Tap to select: book slides out, content area updates.
- **Filter pills:** Styled as rune-engraved stone chips. Active filter has gold glow. Rarity filters use `gem-*.svg` icons instead of text.
- **Card grid:** Large card previews (not tiny rows). Each card shows: art from `cardArtPath()`, name, cost pip, attack/health in bottom corners using `icon-attack.svg` / `icon-health.svg`, rarity gem icon, effect icon if applicable. Count stepper (+/-) as small stone buttons.
- **Tap-to-add animation:** Card briefly scales 1.0→1.1→1.0, count number does the slide-up increment animation, `tap` sound.
- **Mana curve:** Visual bar chart using filled pips per mana cost — already exists, enhance with gradient fills matching mana color.
- **Disenchant section:** Cards eligible for breakdown shown with a cracked overlay. Tap to disenchant: card shatters into particle dust animation, rune count increments with golden flash.

#### SocialScreen — "The Tavern Hall"

**Background:** `bg-social.svg` full-bleed.

**Layout:**
```
┌──────────────────────────────────┐
│  Profile hero card               │
│  [Avatar] [Name] [Rank insignia] │
│  [Stats: W/L/Streak/Rating]     │
│  ─── rune divider ───            │
│  Leaderboard podium (top 3)      │
│  🥇 [name] 🥈 [name] 🥉 [name] │
│  Full ranking table below        │
│  ─── rune divider ───            │
│  Friends list (card rows)        │
│  [avatar][name][online•][⚔ btn] │
│  [Add friend input]             │
│  ─── rune divider ───            │
│  Clan banner                     │
│  [Clan name + tag + members]     │
│  ─── rune divider ───            │
│  Card Trading panel              │
│  [Your offer | Their request]    │
│  [Active trades list]            │
└──────────────────────────────────┘
```

- **Profile hero card:** Full ornate panel with player avatar (use `fractured-arcanum-hero-player.svg`), rank insignia (`rank-*.svg`), stats displayed as icon+number pairs (not text labels). Win rate as a small circular arc gauge.
- **Leaderboard podium:** Top 3 on elevated pedestals (CSS pseudo-elements for pedestal shapes). Gold/silver/bronze backgrounds using rank insignia. Names + ratings displayed. Rest of leaderboard in a scroll list below with alternating row backgrounds.
- **Friends list:** Each friend is a mini card panel (not a text row) — shows name, online presence (pulsing green gem, not a CSS dot), rank insignia, and a "Challenge" button (crossed-swords icon). Challenge sent → dramatic banner slides down with `challenge` sound.
- **Clan banner:** Styled as a heraldic banner — clan name in display font, tag as a shield badge, member list as avatar circles in a row, leave/create/join buttons as stone-framed actions.
- **Trading panel:** Split-screen picker:
  - Left panel "Your Offer": card grid of your collection, tap to add to offer
  - Right panel "Their Request": card grid for what you want in return
  - Center divider with animated ⚡ exchange icon
  - Active trades list below: each trade as a card showing offer→request with accept/reject stone buttons, countdown timer in amber

#### ShopScreen — "The Merchant's Bazaar"

**Background:** `bg-shop.svg` full-bleed. Warm lighting feel.

**Layout:**
```
┌──────────────────────────────────┐
│  Rune balance (prominent)        │
│  💎 1,240 Runes [claim daily]   │
│  ─── rune divider ───            │
│  Pack catalog (3 columns)        │
│  ┌────────┬────────┬────────┐    │
│  │Standard│Premium │Legend- │    │
│  │Pack    │Pack    │ary    │    │
│  │[art]   │[art]   │[art]  │    │
│  │100 💎  │250 💎  │500 💎 │    │
│  └────────┴────────┴────────┘    │
│  ─── rune divider ───            │
│  Theme previews (horizontal)     │
│  ┌──────┬──────┬──────┐          │
│  │Royal │Ember │Moon  │          │
│  │[swatch]│[swatch]│[swatch]│    │
│  └──────┴──────┴──────┘          │
│  ─── rune divider ───            │
│  Card border previews            │
│  [default] [bronze] [frost] ...  │
│  ─── rune divider ───            │
│  Collection stats & breakdown    │
└──────────────────────────────────┘
```

- **Rune balance:** Large display number with animated rune icon. Daily claim button: when available, pulses with golden glow. On claim: runes cascade upward animation, `questComplete` sound, number does count-up.
- **Pack catalog:** Each pack is a tall card showing `pack-*.svg` art, pack name, cost, and card count. On tap to purchase:
  1. Pack shakes (CSS `@keyframes packShake` — 300ms horizontal wiggle)
  2. Lid splits open (two halves rotate apart via CSS `transform: rotateZ(±15deg)`)
  3. Full-screen overlay takes over — dark backdrop
  4. Cards fly in one at a time from pack center, land face-down in a fan layout
  5. Tap each card to flip: 3D `perspective(600px) rotateY(180deg)` flip, 400ms
  6. As card flips, rarity glow (`glow-*.svg`) bursts behind it:
     - Common: subtle gray
     - Rare: blue ring
     - Epic: purple ring + sparkle particles
     - Legendary: golden explosion + screen shake (2px, 200ms) + `legendaryReveal` sound
  7. After all cards revealed: "Open Another" / "Done" buttons appear
  8. Each reveal plays `cardReveal` sound; legendary gets extended fanfare
- **Theme previews:** Large swatch cards showing actual theme colors applied to a mini card preview. Owned themes have a "Selected ✓" stone badge. Unowned show cost + "Unlock" button.
- **Card borders:** Row of card-frame previews — each shows a sample card with that border style applied. CSS `border-image` or inset `box-shadow` per border type (already exists in CSS, enhance with SVG frames).

#### BattleScreen — "The Arena"

**Background:** Enhanced `fractured-arcanum-board.svg` with lane grid. No other screen elements bleed through — battle is a full takeover.

**Layout:**
```
┌──────────────────────────────────┐
│  Enemy HUD                       │
│  [Hero portrait][HP bar][name]   │
│  ───────────────────────         │
│  Enemy board (3 lanes)           │
│  ┌──────┬──────┬──────┐          │
│  │ unit │ unit │empty │          │
│  └──────┴──────┴──────┘          │
│  ─── center divider ───          │
│  ┌──────┬──────┬──────┐          │
│  │ unit │empty │ unit │          │
│  └──────┴──────┴──────┘          │
│  Player board (3 lanes)          │
│  ───────────────────────         │
│  Player HUD                      │
│  [Hero portrait][HP][Mana pips]  │
│  [Momentum pips][Burst btn]      │
│  ───────────────────────         │
│  Hand (fan layout, horizontal)   │
│  ┌─┐┌─┐┌─┐┌─┐┌─┐                │
│  │ ││ ││ ││ ││ │  ← overlapping │
│  └─┘└─┘└─┘└─┘└─┘   fan spread  │
│  ───────────────────────         │
│  [End Turn]                      │
└──────────────────────────────────┘
```

**Key visual upgrades:**

- **Unit cards on board:** Larger art (not tiny squares). Each slot shows unit portrait from card art, attack badge (bottom-left, sword icon + number), health badge (bottom-right, heart icon + number), effect icon (top-right corner if applicable). Rarity border glow on the card edge. Guard units get a shimmering blue shield overlay.
- **Hero portraits:** Use `fractured-arcanum-hero-player.svg` / `hero-enemy.svg`. Health bar as segmented crystal bar (not a plain progress bar) — segments crack and fall away as damage is taken.
- **Mana pips:** Use `pip-mana-filled.svg` / `pip-mana-empty.svg` instead of colored CSS dots. Each pip fills with a micro-animation (scale bounce + glow) at turn start.
- **Momentum pips:** Same treatment with `pip-momentum-filled.svg` / `pip-momentum-empty.svg`. Amber glow.
- **Hand fan layout:** Cards overlap horizontally, fanned out. On hover/touch, hovered card rises above others (translateY -30px + scale 1.1). Unplayable cards dimmed with a cost overlay (existing, keep). Card art visible in each hand card.
- **Attack animation sequence:**
  1. Attacker card lifts slightly (scale 1.05)
  2. Valid targets highlighted with pulsing gold border
  3. On target selection: attacker slides toward target lane (translateX/Y, 200ms ease-out)
  4. Impact flash: white flash overlay on target (60ms), `damageFlash` plays, `attack` sound
  5. Attacker slides back to origin (150ms ease-in)
  6. If target dies: death dissolve animation (scale down + opacity + blur)
  7. Health numbers bounce on change
- **Card play animation:**
  1. Card lifts from hand fan
  2. Slides to target lane on board (300ms)
  3. Landing burst (scale pop 1.15→1.0 + rarity glow flash)
  4. `summon` sound plays
  5. If charge: immediate attack highlight pulse
- **Momentum Burst animation:**
  1. All momentum pips pulse simultaneously
  2. Red energy ring expands outward from player hero
  3. All enemy units flash with damage
  4. `burst` sound plays
- **Battle intro (BattleIntroOverlay):**
  - Full-screen dark backdrop fades in
  - `overlay-vs.svg` slams into center (scale 1.4→1.0, bounce easing)
  - Player name + rank insignia slide in from left
  - Opponent name + rank insignia slide in from right
  - `match` sound plays
  - 2.5s hold → overlay dissolves, board fades in
- **Victory overlay (RewardOverlay):**
  - `overlay-victory.svg` banner unfurls from top (translateY animation)
  - Golden particles shower down (CSS animated `particle-ember.svg` elements)
  - Reward cards spread in fan below banner (rune gain, rating change, streak count)
  - `win` sound → if rank increased, `rankUp` sound after 1s delay
  - Claim button pulses with gold glow
- **Defeat overlay:**
  - Screen desaturates (CSS `filter: saturate(0.3) brightness(0.6)` on board)
  - `overlay-defeat.svg` stamps into center (scale 1.3→1.0, slight rotation wiggle)
  - `lose` sound plays
  - Muted "Return to Menu" button
- **Enemy turn:** Existing banner enhanced: enemy hero portrait on left, "Enemy is thinking..." text on right, animated ellipsis dots. Each enemy action has a brief delay (existing step animation) with card highlight before execution.
- **NavBar hidden** during battle. TopBar replaced with a minimal battle HUD (turn count, leave button as a small X in corner).

#### SettingsScreen — "The Scribe's Desk"

**Background:** `bg-settings.svg` full-bleed.

**Layout:** Card-style sections on parchment panels:
- **Account panel:** Username, display name, role badge (`rank-*.svg` style for admin/owner)
- **Preferences:** Sound toggle (rune-style), analytics consent (rune-style), privacy info on parchment card
- **Complaint desk:** Form styled as a wax-sealed letter — category selector as stamp icons, severity as colored seals, text areas on parchment
- **Admin console (role-gated):** Tabbed with stone tab buttons:
  - Traffic: stat tiles with icon + number (visitors, sessions, queue joins, etc.) on a grid of small ornate panels
  - Live Ops: MOTD as an editable scroll, quest/featured mode as card inputs, maintenance as a danger-glow toggle
  - Users: Search bar + user cards (not a table), role badge per user, promote/demote buttons
  - Audit: Expandable log entries styled as sealed scroll entries — tap to unseal/expand
  - Ownership transfer: Special danger-framed panel with parchment confirmation

---

### 3E. Gamification Polish

Beyond visuals, ensure these gameplay-feel elements are present:

| Element | Where | Spec |
|---------|-------|------|
| **XP / Rating animation** | Post-match overlay, profile | Rating number counts up/down to new value (500ms, ease-out). Progress arc on main menu animates to new position. |
| **Win streak fire** | Profile badge, post-match | At streak ≥ 3: persistent ember particles around streak number. At streak ≥ 5: border upgrades to gold fire. |
| **Daily reward urgency** | Main menu, shop | If unclaimed: golden pulse on quest banner + shop tile gets a notification dot. After claim: satisfied checkmark animation. |
| **Collection completion %** | Collection screen header | "42/89 cards" as a progress ring with percentage. Completing a rarity set triggers a brief celebration (sparkle + sound). |
| **First-time discovery** | Pack opening | First time seeing a new card: "NEW!" badge flies in on the card during reveal, special shimmer. |
| **Rank-up ceremony** | Post-match (if rank boundary crossed) | Full-screen rank insignia reveal: old rank fades out, new rank insignia scales in with golden burst + `rankUp` sound. |
| **Seasonal framing** | Main menu, profile | Season name + remaining time displayed. Season end could trigger special "Season Rewards" ceremony (future). |
| **Haptic feedback everywhere** | All interactive elements | `pulseFeedback()` on: button press (10ms), card play (14ms), attack impact (20ms), pack open (30ms), victory (40ms). |
| **Emote pop** | Battle screen | Sent emote appears as a large floating emoji that scales in, holds 1.5s, then fades (not just a log entry). Received emote does the same on opponent's side. |

---

### 3F. CSS Organization

New App.css sections (add at end, before `@media (prefers-reduced-motion)`):

| Section | Est. Lines | Content |
|---------|-----------|---------|
| `/* ── Screen backgrounds ── */` | ~50 | `.screen-bg-*` classes using generated SVG backgrounds, cover/center, ambient overlays |
| `/* ── Screen transitions ── */` | ~60 | Forward/back/lateral/battle keyframes, `.screen-enter-*` / `.screen-exit-*` |
| `/* ── Game chrome ── */` | ~80 | Button frames, panel frames, dividers, rune toggles, parchment inputs using SVG 9-slice |
| `/* ── Particles & ambient ── */` | ~40 | `.particle` element positioning, float keyframes, random delay utility classes |
| `/* ── Nav tiles (main menu) ── */` | ~50 | `.nav-tile` grid, hover lift, glow, notification dot |
| `/* ── Mode cards (play) ── */` | ~50 | `.mode-card` layout, selected/unselected states, portal animation |
| `/* ── Card browser (collection) ── */` | ~60 | Large card grid, deck spine scroller, filter gems, disenchant shatter |
| `/* ── Social panels ── */` | ~50 | Podium, friend cards, trading split-screen, clan banner |
| `/* ── Pack ceremony (shop) ── */` | ~100 | Pack shake, lid split, card fan, flip 3D, rarity glow bursts, screen shake |
| `/* ── Battle enhancements ── */` | ~120 | Fan hand, attack slide, impact flash, death dissolve, mana pip fill, hero HP segments, emote pop, intro slam, victory shower, defeat stamp |
| `/* ── Gamification effects ── */` | ~40 | Streak fire, rank-up ceremony, count-up numbers, progress ring, NEW badge |
| `/* ── Fantasy typography ── */` | ~20 | `@font-face`, heading overrides, tabular-nums for stats |

**Estimated CSS addition: ~720 lines** (App.css grows from 2,662 → ~3,380).

Move the `prefers-reduced-motion` block and production polish block to the very end so they override everything.

### 3M. Mobile-First Full-Viewport Density Pass

**Goal:** Every primary screen should read as a single in-game scene on a 375px mobile viewport, with **no unnecessary vertical page scroll**. Intentional scrolling is allowed only where it is part of the interaction model:

- horizontal hand fan in battle
- horizontal deck and cosmetic rails
- pack reveal sequences
- modal content and long admin/audit lists

**Global density rules:**

1. hero/status chrome should stay within roughly the top 15–20% of the viewport
2. the primary interaction zone should occupy the visual center of the screen
3. footer docks should be compact and action-focused
4. stacked informational cards should be collapsed into tabs, carousels, chips, or compact badges where possible
5. if a screen needs scrolling, it should be the **content region**, not the whole page shell

#### Planned screen-by-screen density pass

**Home / main menu**
- keep the nav-tile grid above the fold at phone size
- compress quest and featured-mode messaging into a tighter utility card
- keep seasonal progress visible without pushing the primary nav below the fold
- **Likely files:** `src/screens/HomeScreen.tsx`, `src/App.css`

**Play screen**
- keep mode cards, queue portal, and the main CTA visible together on a single phone screen when idle
- reduce explanatory copy while queue/search details are inactive
- compress queue-found and queue-search states into a dedicated central stage rather than extra stacked cards
- **Likely files:** `src/screens/PlayScreen.tsx`, `src/App.css`

**Collection screen**
- keep deck roster and filters prominent while making the card browser the intended scroll surface
- collapse secondary stats and breakdown content behind compact sections where needed
- preserve quick battle access without forcing long vertical scrolling
- **Likely files:** `src/screens/CollectionScreen.tsx`, `src/App.css`

**Social screen**
- convert the long social stack into denser subsections or tabbed segments so friends, clan, and trades do not all compete vertically at once
- keep the profile hero and the currently active social action above the fold
- **Likely files:** `src/screens/SocialScreen.tsx`, `src/App.css`

**Shop screen**
- keep reward vault and pack purchase actions visible immediately
- move themes, borders, and post-open breakdowns into rails or compact reveal sections
- avoid tall stacked cards that push the pack CTA too far down the screen
- **Likely files:** `src/screens/ShopScreen.tsx`, `src/App.css`

**Settings screen**
- keep account/preferences visible in the first viewport
- push complaint and admin subsections into denser grouped panels or tabs
- long audit/user lists remain intentional scroll surfaces inside their section, not the whole screen shell
- **Likely files:** `src/screens/SettingsScreen.tsx`, `src/App.css`

#### Battle screen — single-screen combat target

The screenshot review confirms the active combat HUD is still too tall. The next pass should follow a classic digital card-game stack:

1. **Slim top duel ribbon**
   - enemy name, player name, health, and turn state only
   - remove nonessential live meta such as rating and win rate from the active battle view
2. **Board-first arena stage**
   - enemy row on top
   - compact clash strip in the center
   - player row below
   - all six lanes visible together without page scrolling
3. **Compact combat dock**
   - burst, end turn, and leave actions grouped tightly
   - mana and momentum live near the hand dock instead of in a large status slab
4. **Hand dock remains horizontal**
   - preserve the current fan layout and horizontal scroll behavior
   - keep hand readability without requiring the board to move off-screen

**Battle acceptance target:**
- active battle should fit in one mobile viewport as much as possible
- no large health/status panels pushing the board down the page
- vertical page scrolling should be eliminated during normal combat
- only the hand may scroll horizontally

**Likely files:** `src/screens/BattleScreen.tsx`, `src/App.tsx`, `src/App.css`

### 3N. Long-Press Inspect Hardening

**Goal:** Long-press card inspection must feel native and reliable without triggering browser or system context menus.

#### Required behavior
- long-press opens the inspect modal consistently
- long-press should not open a browser context menu, touch callout, or text selection overlay
- tap-to-play and tap-to-select must still feel immediate
- horizontal hand scrolling must continue to work naturally on touch devices

#### Implementation notes
- keep the existing `onContextMenu` prevention in `getLongPressProps()`
- add battle-card and slot level CSS hardening:
  - `-webkit-touch-callout: none`
  - `user-select: none`
  - `-webkit-user-select: none`
- if needed, add gesture-safe cancel logic so a horizontal drag cancels inspect instead of fighting hand scroll
- verify inspect still works on cards in hand, on units in lanes, and in collection/breakdown contexts

**Likely files:** `src/App.tsx`, `src/App.css`, `src/screens/BattleScreen.tsx`, `src/components/CardInspectModal.tsx`

### 3O. Chrome Normalization & Stray Frame Cleanup

**Goal:** Remove the current frame-within-frame look and any floating or orphaned decorative rectangles across auth, dashboard, nav, and battle.

#### Current findings from the UI audit
- buttons currently stack a gradient fill, SVG chrome art, and a separate CSS border on the same control
- framed panels currently combine `panel-frame.svg` with an additional border/radius shell, which reads as a double outline on mobile
- the bottom nav and battle HUD both nest multiple framed surfaces, which is likely causing the “floating frame” feel visible in the latest screenshots
- the home spotlight/dashboard shell is carrying status messaging in the same framed region, which creates empty framed space below the main content

#### Planned cleanup pass
1. define a **single-owner chrome rule**: a surface owns either the SVG frame or the CSS edge treatment, never both
2. normalize primary, ghost, danger, and auth buttons so their art scales flush to the true button bounds
3. remove decorative pseudo-element art from any shell where it reads like an unattached box or extra plate
4. split dashboard hero, nav-tile, and toast/status surfaces so empty framed regions do not linger on screen
5. compress battle HUD chrome into one intentional duel ribbon rather than stacked framed slabs

**Acceptance target:**
- no button looks like it has an inner button trapped inside an outer one
- no empty framed box appears on the home dashboard or battle HUD
- auth, nav, dashboard, and battle controls all share the same chrome rules

**Likely files:** `src/App.css`, `src/App.tsx`, `src/components/NavBar.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/BattleScreen.tsx`

### 3P. Live Connection Resilience & Rejoin Recovery

**Goal:** Disconnects and reconnects should recover cleanly without requiring the player to close the app or refresh the page.

#### Likely causes identified in the current code review
1. `disconnect` and `connect_error` currently flip offline state and clear queue state, but they do not promote the UI into a full reconnect workflow with bounded retry/fallback behavior
2. `game:rejoin_failed` currently only clears the opponent-disconnect indicator; it does not fully restore a safe, non-stuck screen state
3. the app can emit `game:rejoin` both automatically on socket connect and manually from Resume Battle, so the rejoin flow should be de-duplicated during unstable network conditions

#### Planned resilience pass
- add an explicit connection lifecycle state: online → reconnecting → rejoining → recovered / failed
- add a reconnect timeout and a visible recovery CTA such as Retry Now or Return Home
- guard rejoin requests so only one in-flight rejoin attempt can run at a time
- keep ranked-battle recovery separate from general queue recovery so queue controls do not stay hung after a transient outage
- verify server-side room recovery, forfeit timer clearing, and opponent reconnect notifications remain consistent after reconnection
- improve logging around connect, disconnect, connect_error, and rejoin_failed so the failure path is visible during testing

**Acceptance target:**
- transient disconnects recover without a hard refresh in normal cases
- failed rejoin returns the player to a safe recoverable state instead of hanging indefinitely
- queue and live-match controls become usable again after reconnect succeeds or fails cleanly

**Likely files:** `src/App.tsx`, `src/App.css`, `server/server.js`, `server/game-room.js`

---

## Phase 3Q–3AA — Hearthstone-Style Mobile Direction (Planning Addendum, 2026-04-18)

> Direction recap: every screen is one self-contained scene on a phone-sized viewport, content fits without page scrolling, transitions feel like opening a book or a portal rather than navigating a website, and every interactive element pairs original generated art with a synthesized sound and a haptic pulse. These items extend the existing 3J / 3M / 3O / 3P pass and should be picked up after the remaining density work is done. Nothing here ships until it has a paired sound, motion, and reduced-motion fallback.

### 3Q. One-Screen Scene Shell (no page scroll on primary screens)

**Goal:** Convert the primary player-facing screens (Home, Play, Collection, Social, Shop, Settings, Battle) from "long pages with a sticky bottom-nav" into self-contained "scenes" that fill the viewport exactly once.

#### Scene shell rules
- the app shell occupies `100dvh` (with `100svh` fallback) on mobile, with no body scroll
- the active screen is a flex column: header dock (top), scene body (flex 1, owns its own scroll if any), footer dock + bottom nav (bottom)
- only the **scene body** may scroll, never the page itself
- horizontal rails (deck spines, pack carousel, hand fan, theme/border carousels) remain horizontally scrollable inside the scene body
- modals, overlays, and ceremony screens take over the entire shell as full-bleed layers, never letting the underlying scene scroll

#### Implementation notes
- introduce a top-level `.app-scene` wrapper that sets `height: 100dvh; overflow: hidden`
- each screen renders `<header className="scene-dock">…</header>`, `<div className="scene-body">…</div>`; the bottom-nav stays in the shell, not in screens
- existing `.section-card` content reflows into the scene body so it can scroll inside the body without pushing dock chrome offscreen
- explicit fallbacks for very short viewports (< 600px tall) — collapse second-rank chrome into a peek state
- desktop (≥ 1024px wide) keeps the same shell but allows a max width and centered layout

**Likely files:** `src/App.tsx`, `src/App.css`, every `src/screens/*.tsx`

### 3R. Hearthstone-Style Scene Transitions

**Goal:** Screen-to-screen movement should feel like a book turning or a curtain pulling, not a router fade.

#### Planned transition vocabulary
- **Curtain pull** (forward into a content scene): the new scene wipes in from the right behind a parchment-curtain mask, while the previous scene parallax-scrolls left at half speed
- **Reverse curtain** (back to home): mirror animation right-to-left with a soft book-close sound
- **Portal slam** (any screen → battle): existing `zoomWhoosh` upgraded — central VS spark expands, the screen darkens around it, then the battle scene irises in from the spark
- **Rune wipe** (lateral nav, e.g. Social ↔ Shop): a horizontal band of rune particles sweeps across the screen and the new scene materializes in the wake
- **Modal materialize**: modals scale in from 0.92 with a soft glow ring, accompanied by a `tap` chime; closing collapses back into the trigger element
- all transitions gated on `prefers-reduced-motion: reduce` — fall back to instant cross-fade

#### New synthesized sounds (extend `src/audio.ts`)

| Trigger | Sound name | Synthesis sketch |
|---|---|---|
| Curtain pull forward | `sceneOpen` | Soft parchment whoosh — filtered noise burst 200ms, low-pass sweep 800→200Hz |
| Reverse curtain | `sceneClose` | Mirror sweep + faint click 60ms |
| Portal slam | `portalSlam` | Deep sub bass thud 80Hz 120ms layered under existing `summon` |
| Rune wipe | `runeWipe` | Crystal shimmer — triangle 1760Hz arpeggio of 4 notes, 60ms each |
| Modal materialize | `modalOpen` | Existing `tap` overlaid with a soft sine 660Hz glow tone |
| Modal dismiss | `modalClose` | Reversed `modalOpen` |

**Likely files:** `src/audio.ts`, `src/App.css` (new `.scene-transition-*` classes), `src/App.tsx` (`openScreen` / `transitionToScreen` orchestrator), `src/utils.ts` (direction helper)

### 3S. Battle Polish — Card Drag, Card Slam, Combat Telegraphs

**Goal:** Bring the battle interaction closer to Hearthstone's tactile feel — cards lift, drag, and slam onto lanes, attacks telegraph their target, and reactions feel weighty.

#### Card play interactions
- in addition to tap-to-play, support **drag-from-hand to lane**: pointer down on a hand card → card lifts and follows the cursor with a subtle scale + glow → drop on a valid lane to play; drop outside snaps back
- valid drop lanes pulse with a gold ring while a draggable card is in flight
- on play, the card "slams" into the lane: scale 1.0 → 1.15 → 1.0 with a brief ring burst and `cardSlam` sound; the card art briefly covers the lane center, then settles into the slot frame
- desktop uses mouse drag; touch keeps tap-to-play but adds a **pull-up gesture** on hand cards (drag finger up > 60px from the hand fan to commit the play)
- must coexist with the long-press inspect cancel guard added in 3N

#### Attack telegraphs
- when an attacker is selected, draw an SVG arrow from the attacker to the cursor / drag target
- valid defenders pulse red, invalid defenders desaturate
- on resolution, the attacker physically lunges toward the target (translate + slight rotate) and recoils back, mirroring the slam-and-return motion

#### Hero portrait reactions
- low health (< 30%): hero portrait pulses with a red vignette and a slow heartbeat sound (`heroLowHp`, looping low-volume)
- on damage taken: portrait shakes 4px and an edge-cracks SVG overlay flashes briefly
- on heal: portrait gets a green halo

#### New synthesized sounds

| Trigger | Sound | Synthesis sketch |
|---|---|---|
| Card lifts from hand | `cardLift` | Brief soft swoosh, filtered noise 80ms |
| Card slams into lane | `cardSlam` | Wood thud + bright top harmonic, 140ms |
| Attack lunge | `attackLunge` | Existing `attack` extended with a metallic ring tail |
| Hero damage | `heroHit` | Low impact thud 90Hz + brief crack 1200Hz |
| Heal pulse | `heroHeal` | Soft sine swell 440→660Hz, 220ms |
| Low HP heartbeat | `heroLowHp` | 60bpm sine pulse, very low volume, looping while applicable |

**Likely files:** `src/screens/BattleScreen.tsx`, `src/App.tsx` (drag controllers, attack arrow ref), `src/App.css`, `src/audio.ts`

### 3T. Pack Opening Ceremony (full Hearthstone-style flow)

**Goal:** Implement the full pack ceremony already specified in the Phase 3 design, but elevated to a dedicated overlay route on top of the Shop scene.

#### Sequence
1. tap pack → pack art zooms to center, shop fades behind a darkened veil
2. pack shakes (CSS keyframe), `packOpen` plays
3. lid splits, golden light bursts upward
4. cards arc out into a fan layout, face-down
5. tap any card to flip — 3D rotateY + rarity glow burst (`glow-*.svg`) sized to card
6. legendary cards trigger screen-shake + extended `legendaryReveal` fanfare
7. "NEW!" badge animates in if first-time card
8. footer actions: `Open Another` (if budget) / `Done`

#### New sounds

| Trigger | Sound | Notes |
|---|---|---|
| Pack hover/select | `packHover` | Soft chime 880Hz 60ms |
| Lid split | `lidSplit` | Sharp crack 200Hz + bright sparkle |
| Card arc out | `cardArc` | Whoosh per card, slight pitch variance |
| First-time NEW card | `firstTime` | Bright bell triad |

**Likely files:** new `src/components/PackCeremonyOverlay.tsx`, `src/screens/ShopScreen.tsx`, `src/App.css`, `src/audio.ts`

### 3U. Tactile Micro-Feedback System (sound + haptic + motion library)

**Goal:** Every interactive control in the game has a consistent feedback fingerprint — visual press, sound, and haptic — defined by a single primitive.

#### Plan
- create `src/feedback.ts`: `function feedback(kind: FeedbackKind): void` that pairs a sound + haptic + optional flash class
- kinds: `tap`, `confirm`, `cancel`, `error`, `nav`, `select`, `equip`, `claim`, `purchase`, `inspect`
- replace ad-hoc `playSound(...)` + `pulseFeedback(...)` call sites with `feedback('confirm')` etc.
- add a `data-feedback="<kind>"` attribute opt-in for buttons so the shell can wire feedback once instead of every component repeating boilerplate
- consolidate haptic durations and sound mappings in one place so future sound swaps don't require touching each screen

#### Acceptance target
- one source of truth for "what does pressing an X-kind button feel like"
- no remaining naked `playSound(...)` call sites in screens (handlers can still call it directly for special cases)

**Likely files:** new `src/feedback.ts`, `src/App.tsx`, every `src/screens/*.tsx`

### 3V. Ambient Scene Loops (subtle background audio per screen)

**Goal:** Each scene gets a subtle synthesized ambient bed that reinforces its theme — not music, just a low atmospheric pulse so silence does not feel sterile on mobile.

#### Plan
- generate looped low-volume Web Audio beds (oscillator + slow LFO + reverb-style delay):
  - **Home / Main Menu:** soft wind + distant rune chime every ~12s
  - **Play / Arena Gate:** distant crowd murmur (filtered noise + slow modulation)
  - **Collection / Library:** parchment rustle + low choir hum
  - **Social / Tavern:** crackling fire + faint mug clink every ~20s
  - **Shop / Bazaar:** wind-chime tinkle + soft drum
  - **Settings / Scribe Desk:** quill scratch every ~15s
  - **Battle:** war drum heartbeat synced to turn changes
- master volume defaults to 0 and ramps up to ~0.015 on enter, fades out on leave
- gated by the existing `soundEnabled` toggle plus a new `ambientEnabled` toggle in Settings (default off so we never surprise users)

**Likely files:** new `src/ambient.ts`, `src/App.tsx`, `src/screens/SettingsScreen.tsx`

### 3W. Card Reveal & Reward Cinematography

**Goal:** Every reward moment (post-battle, daily claim, pack reveal, rank-up) shares a consistent cinematic vocabulary.

#### Plan
- introduce `RewardCinemaOverlay` — a single overlay component that takes a sequence of "beats" (icon, label, count-up value, sound, optional shower particles) and plays them with timing
- replace ad-hoc reward UIs (current `RewardOverlay`, daily-claim toast, rank-up if added, quest-complete celebration) with sequences fed into the same overlay
- standardize celebratory motions: number count-up animation, golden ember shower (`particle-ember.svg`), banner unfurl from `overlay-victory.svg`
- always close with an explicit `Continue` call-to-action button instead of auto-dismiss to respect the moment

**Likely files:** new `src/components/RewardCinemaOverlay.tsx`, `src/App.tsx`, `src/components/RewardOverlay.tsx` (collapse into the new overlay), `src/screens/HomeScreen.tsx`, `src/screens/ShopScreen.tsx`

### 3X. Onboarding Tour & First-Time Polish

**Goal:** A first-launch player should be guided through the scene model with a short, skippable tour that demonstrates the Hearthstone-style direction.

#### Plan
- detect first launch via `localStorage.firstLaunchComplete`
- present a 5-step tour overlay that highlights: nav tiles → deck builder access → queue button → battle hand → settings
- each step uses a spotlight cutout (radial mask over a darkened scene), a parchment caption card, and a `Next` / `Skip` action
- pair each step with a `tap`/`nav` feedback pulse
- after the final step, fire a one-time `questComplete` flourish and persist completion
- a "Replay tour" entry lives in Settings

**Likely files:** new `src/components/OnboardingTour.tsx`, `src/App.tsx`, `src/screens/SettingsScreen.tsx`

### 3Y. Mobile Gesture Layer (swipe-between-scenes)

**Goal:** On touch devices, allow horizontal swipe between adjacent primary scenes (Home ↔ Play ↔ Collection ↔ Social ↔ Shop ↔ Settings), mirroring the bottom-nav order, similar to a swipeable carousel of scenes.

#### Plan
- add a touch listener at the scene shell layer that tracks horizontal swipe distance
- threshold: > 25% viewport width or > 40% velocity → commit nav to neighbor scene with the curtain transition (3R)
- guard: do not intercept swipes that originate inside horizontal rails (hand fan, deck spine list, pack carousel, leaderboard, trade picker, etc.) — those own their gestures
- battle scene opts out entirely
- pair commit with `runeWipe` sound

**Likely files:** `src/App.tsx`, `src/App.css`, `src/utils.ts`

### 3Z. Accessibility & Reduced-Motion Parity

**Goal:** Every new motion / sound / haptic feature must have a documented reduced or off path so accessibility is not retrofitted.

#### Plan
- audit every animation added in 3Q–3Y under `prefers-reduced-motion: reduce` — must collapse to instant or simple cross-fade
- audit every new sound — must respect the `soundEnabled` toggle and the new `ambientEnabled` toggle separately
- haptics — add a Settings toggle for `hapticsEnabled`, default on; gate `pulseFeedback()` on it
- ensure focus-visible outlines remain crisp and reachable on every new control
- ensure the swipe gesture layer has keyboard equivalents (arrow keys when scene shell is focused)

#### Acceptance target
- a player who turns off motion, sound, ambient, and haptics still has a fully usable game
- no screen relies on a non-text cue alone for state

**Likely files:** `src/App.css`, `src/audio.ts`, `src/ambient.ts`, `src/feedback.ts`, `src/screens/SettingsScreen.tsx`

### 3AA. Pre-Ship Checklist Additions for the New Direction

Append to the Phase 4D pre-ship checklist when these items ship:

- [ ] Primary scenes never produce body scroll on mobile (only the scene body region, where intended)
- [ ] All scene transitions use the new vocabulary (curtain / reverse curtain / portal slam / rune wipe / modal materialize)
- [ ] Each transition has a paired generated sound and respects `prefers-reduced-motion`
- [ ] Battle supports drag-to-play in addition to tap-to-play, with a snap-back fallback
- [ ] Battle attack telegraph (arrow + valid/invalid pulsing) is present
- [ ] Hero portraits react to damage, heal, and low-HP states
- [ ] Pack opening uses the full ceremony overlay with rarity-tiered glow + sound
- [ ] All button feedback flows through the unified `feedback()` primitive
- [ ] Ambient audio toggle exists in Settings, defaults off, and is honored everywhere
- [ ] Reward moments (battle, daily, pack, rank-up) all use the unified `RewardCinemaOverlay`
- [ ] First-launch onboarding tour appears once and is replayable from Settings
- [ ] Swipe gesture between primary scenes works on touch and never hijacks horizontal rails
- [ ] Settings exposes toggles for sound, ambient, haptics, and respects OS-level reduced-motion

---

## Phase 4 — Docs, Index, & Manifest Update

After all code and art changes are complete:

### 4A. Asset Manifest & Pipeline Docs

1. Run `npm run assets:generate` — verify all ~70 new SVGs are written and `asset-manifest.json` is updated with every new entry (backgrounds, tiles, ranks, packs, gems, chrome, effects, overlays, particles).
2. Update `docs/asset-pipeline.md`:
   - Document all asset categories (backgrounds, tiles, rank insignia, packs, gems, chrome, effects, overlays, particles)
   - Document the full list of generated UI assets with their paths and usage
   - Note the SVG-only local generation approach and commercial safety
   - Add a section on how to add new card art when new cards are introduced

### 4B. Code Index Rewrite

1. Rewrite `.github/index/00-overview.md`:
   - New file map including `src/contexts/` (5 providers), `src/screens/` (7 screens), `src/components/` (7+ components)
   - Updated build commands
   - Asset generation command (`npm run assets:generate`)
   - Total asset count and categories
2. Rewrite `.github/index/02-client-ui.md`:
   - Each of the 7 screens: name, file, line count, which contexts it reads from, key visual elements
   - Each shared component: name, file, props summary
   - Context hooks: `useAppContext()`, `useGame()`, `useProfile()`, `useSocial()`, `useQueue()`
   - Navigation flow diagram (which screen → which screen, transition type)
   - Screen background asset mapping
3. Create `.github/index/08-assets.md`:
   - Complete catalog of all generated assets organized by category
   - Path conventions (`/generated/ui/`, `/generated/cards/`)
   - Naming conventions (bg-*, tile-*, rank-*, pack-*, gem-*, btn-*, pip-*, icon-*, fx-*, overlay-*, glow-*, particle-*)
   - How to regenerate (`npm run assets:generate`)
   - How to add new assets to the generator
4. Update `.github/index/06-styles.md`:
   - New CSS section map with the added sections
   - Document the transition system
   - Document the 9-slice SVG chrome approach
   - Document the particle system
   - List all new keyframe animations

### 4C. Copilot Instructions Update

Update `.github/copilot-instructions.md`:
- **File roles table:** Add contexts directory, update screen names/counts, add asset categories
- **Architecture section:** 5 contexts, 7 screens, provider nesting order, asset pipeline
- **React rules:** Use specific context hooks (`useGame()`, `useProfile()`, etc.), not monolithic `useApp()`. New screens read only from the contexts they need.
- **CSS & Style rules:**
  - No browser-default controls — every interactive element uses game chrome
  - New animations must respect `prefers-reduced-motion`
  - Use generated SVG assets for all visual elements; no emoji in production UI (effect labels use `fx-*.svg` icons)
  - Buttons use SVG button frames, panels use `panel-frame.svg`
  - Section dividers use `divider-rune.svg`
- **Asset rules:**
  - All new visual assets go through `scripts/generate-brand-assets.mjs`
  - All assets must be original SVG (commercial-safe, no attribution)
  - Card art follows existing blueprint pattern in the generator
  - UI assets registered in `asset-manifest.json`
- **Sound rules:**
  - All new sounds synthesized in `src/audio.ts` via Web Audio API
  - No audio file downloads
  - Sound triggers paired with haptic feedback via `pulseFeedback()`
  - Every interactive action should have a sound + haptic pair

### 4D. Pre-Ship Audit Checklist

After all phases complete, verify:

- [ ] Every screen has a full-bleed illustrated background (no plain CSS bg-color)
- [ ] Primary player-facing screens fit the mobile viewport effectively without unnecessary page scrolling
- [ ] Battle fits into a single active viewport as much as possible; only the hand uses horizontal scrolling
- [ ] Long-press inspect never opens a browser or system context menu
- [ ] Buttons and framed panels use a single intentional chrome layer with no frame-within-frame artifacts
- [ ] No stray floating frames or empty framed boxes remain on dashboard, nav, auth, or battle surfaces
- [ ] Reconnect and rejoin flows recover cleanly without requiring a hard refresh
- [ ] Zero emoji in the rendered UI (all replaced with SVG icons)
- [ ] Zero browser-default `<button>`, `<input>`, `<select>` styling visible
- [ ] Zero plain `<hr>` dividers (all use `divider-rune.svg`)
- [ ] Every number change is animated (health, runes, rating, streak)
- [ ] Every interactive element has: hover state, active state, focus-visible state, sound, haptic
- [ ] Pack opening plays the full ceremony (shake → open → fan → flip → glow per rarity)
- [ ] Battle intro plays VS slam
- [ ] Victory plays golden shower + rank check
- [ ] Defeat plays desaturation + stamp
- [ ] All animations disabled under `prefers-reduced-motion: reduce`
- [ ] Mobile 375px: all screens usable, touch targets ≥ 44px, hand fan scrollable
- [ ] `npm run assets:generate` produces all assets, manifest is complete
- [ ] `npm run build` passes, bundle size < 500 kB gzip
- [ ] `npm test` passes (45/45+)
- [ ] `npm run lint` passes
- [ ] No placeholders, TODOs, or stubs anywhere

---

## Active Execution Backlog

> Completed Phase 1 architecture work, screen extraction, asset generation, docs refresh, and earlier verification passes have been intentionally removed from this active backlog for brevity. The items below are the remaining high-value polish and stability steps.

| Step | Description | Risk | Primary files | Status |
|------|-------------|------|---------------|--------|
| **3D** | Finish transition and motion cleanup where screen changes still feel web-like instead of game-like | Medium | App.tsx, App.css | 🟡 partial |
| **3E** | Tighten Home dashboard so hero, tiles, and utility cards fit the viewport more effectively | High | HomeScreen.tsx, App.css | 🟡 active |
| **3F** | Compress Play screen and queue states so the central CTA remains above the fold | Medium | PlayScreen.tsx, App.css | 🟡 active |
| **3G** | Keep Collection filters and deck tools visible while making the card browser the intentional scroll region | Medium | CollectionScreen.tsx, App.css | 🟡 active |
| **3H** | Convert Social into denser, more segmented panels to reduce page-length sprawl | Medium | SocialScreen.tsx, App.css | 🟡 active |
| **3I** | Keep Shop purchase actions and reward state visible without long stacked scrolling | Medium | ShopScreen.tsx, App.css | 🟡 active |
| **3J** | Final battle layout compression pass for one-screen mobile combat | Highest | BattleScreen.tsx, App.css, App.tsx | � first pass landed (HUD trim, status strip removed, turn state inline) |
| **3K** | Compact Settings and admin surfaces into grouped, tabbed, or sectional layouts | Medium | SettingsScreen.tsx, App.css | 🟡 active |
| **3L** | Finish remaining gamification and ceremonial polish where it still supports readability | Low | App.css, overlays, screens | 🟡 partial |
| **3M** | Full-viewport density pass across all player-facing screens | Highest | App.css, all screen files | 🟡 partial (battle landed; home/play/collection/social/shop/settings remaining) |
| **3N** | Harden long-press inspect and suppress browser/system context menus | Medium | App.tsx, App.css, BattleScreen.tsx | 🟢 done (touch-callout suppression on slot/hand/battle/collection cards + pointer-move cancel guard) |
| **3O** | Normalize button/panel chrome and remove stray floating frame artifacts | Highest | App.css, NavBar.tsx, HomeScreen.tsx, BattleScreen.tsx | 🟢 done (single-owner chrome on buttons/panels, dropped overlay-vs.svg from dais, nav un-nested, empty Home toast hidden) |
| **3P** | Stabilize reconnect/rejoin recovery so live play does not require refresh | Highest | App.tsx, server/server.js, server/game-room.js | 🟢 client landed (in-flight rejoin guard, gated auto-rejoin, recovery transition on rejoin_failed). Server-side audit still open. |
| **3Q** | One-screen scene shell — no body scroll on primary screens, scene-body owns scroll | Highest | App.tsx, App.css, all screen files | � done (app-shell now `100dvh` flex column with no shell scroll; screens wrapped in `.scene-stage`; non-battle active panel owns scroll, battle subsections stack with battlefield as the flex grower; html/body/#root locked to 100% height) |
| **3R** | Hearthstone-style scene transitions (curtain / reverse / portal slam / rune wipe / modal materialize) + paired sounds | High | audio.ts, App.css, App.tsx, utils.ts | � done (curtainPullForward/Back, runeWipeFade, portalSlamIris keyframes; `getScreenTransitionSound()` helper maps to new sceneOpen/sceneClose/runeWipe/portalSlam Web Audio cues; modalOpen/Close cues added; covered by tests) |
| **3S** | Battle drag-to-play, attack arrow telegraph, hero portrait reactions, low-HP heartbeat | High | BattleScreen.tsx, App.tsx, App.css, audio.ts | � done (hand cards now lift/follow pointer with cardLift sound + pull-up gesture, drop on a valid lane to play; lanes pulse gold while dragging and desaturate when invalid; cards slam with cardSlam burst on play. Selecting an attacker draws an SVG arrow from the unit to the cursor, valid defenders pulse red, attacks now play attackLunge with metallic ring tail. Hero portraits shake + flash overlay-hero-cracks on damage (heroHit), pulse a green halo on heal (heroHeal); player portrait gets a red vignette pulse + looping heroLowHp heartbeat at ≤ 9 HP that auto-stops on revive/death/exit. Three new generated SVGs (overlay-attack-arrow / overlay-hero-cracks / overlay-hero-halo) added to generator + UI_ASSETS registry; six new synthesized sounds + startLoopingSound helper. All animations and the heartbeat respect prefers-reduced-motion and the soundEnabled toggle.) |
| **3T** | Full pack opening ceremony overlay with rarity-tiered glow + sound | Medium | new PackCeremonyOverlay.tsx, ShopScreen.tsx, App.css, audio.ts | � done (full-screen ceremony overlay zooms the pack to center, shakes, splits the lid, fires a golden burst (`pack-burst.svg`), arcs cards into a fan, and 3D-flips on tap with rarity glows (`glow-*.svg`). Legendary flips trigger screen shake + extended `legendaryReveal`. First-time discoveries (snapshot taken before `handleOpenPack` mutates the collection) animate a `ribbon-new.svg` "NEW!" ribbon and play a `firstTime` bell triad. New synthesized cues `packHover`, `lidSplit`, `cardArc`, `firstTime` join `audio.ts`. Ceremony respects `prefers-reduced-motion` (instant flips, no shake/burst) and remains usable at 375px with ≥44px touch targets. ShopScreen stays thin and re-mounts the overlay via `key` per pack open.) |
| **3U** | Unified `feedback()` primitive for sound + haptic + flash on all controls | Medium | new feedback.ts, App.tsx, all screens | � done (new `src/feedback.ts` exposes a `FEEDBACK_TABLE` keyed by `tap`/`confirm`/`cancel`/`error`/`nav`/`select`/`equip`/`claim`/`purchase`/`inspect`, each pairing a canonical `SoundName` with a haptic duration; `feedback(kind, soundEnabled)` is the single source of truth for control feedback and respects `soundEnabled` + platform vibrate. AppShell handlers (refund, border purchase/equip, queue-found, resume/abandon/leave battle, daily claim, mode/difficulty toggles, quick-battle launch, attacker selection, end turn, long-press inspect) now call `feedback(...)` instead of pairing `playSound + pulseFeedback` inline. Cinematic cues (battle intro `summon`, win/lose, hero-hit, card slam/lift, attack lunge, burst, pack ceremony, scene transitions) intentionally remain on direct `playSound` calls. New `src/feedback.test.ts` locks the table shape + dispatch behaviour; `npm run lint`, `npm test`, and `npm run build` all green) |
| **3V** | Per-scene synthesized ambient beds gated by a new `ambientEnabled` toggle | Low | new ambient.ts, App.tsx, SettingsScreen.tsx | � done (new `src/ambient.ts` builds a Web Audio scene graph per primary screen — Home wind + rune chime, Play crowd murmur, Collection parchment + choir, Social fire + mug clink, Shop wind-chimes + drum, Settings room tone + quill scratch, Battle low rumble + war drum — each as `noiseBed + drone + accent` helpers routed through one master gain that ramps 0 → 0.018 over 0.6 s on enter and back to 0 on leave; `setAmbientScene(scene, enabled)` is the single entry point. AppShell drives it via a `useEffect` on `[activeScreen, soundEnabled, ambientEnabled, loggedIn]`, persists `ambientEnabled` in `STORAGE_KEYS.ambient` (default off), and tears the bed down on unmount. Settings gains an "Ambient atmosphere" preference tile that disables when Arena Audio is muted. New `ambient.test.ts` exercises mount/swap/teardown semantics; lint + 65 tests + build all green) |
| **3W** | Unified `RewardCinemaOverlay` for battle/daily/pack/rank-up reveal beats | Medium | new RewardCinemaOverlay.tsx, RewardCinemaSequence.ts, App.tsx, ShopScreen.tsx, App.css | � done (new `src/components/RewardCinemaOverlay.tsx` plays a sequence of typed `RewardBeat`s — `banner` unfurl, `count` count-up tile, `shower` ember particles, or `card` icon — auto-advancing via timer and finishing on an explicit `Continue` CTA wired through `feedback('claim', soundEnabled)`. Beat schema and pure builders (`buildBattleVictorySequence`, `buildDailyClaimSequence`, `buildPackSummarySequence`, `buildRankUpSequence`) live in `src/components/RewardCinemaSequence.ts`. AppShell owns a single `cinemaSequence` slot plus `presentRewardCinema` / `dismissRewardCinema` exposed via `AppShellContextValue`; the legacy `RewardOverlay.tsx` and the GameProvider `rewardOverlayVisible` flag are gone. Battle wins resolve through the match-complete handler which infers shards, ladder rating delta, and rank-bucket crossings (`Bronze → Silver → Gold → Diamond`) and appends a rank-up sequence when crossed. Daily claims and pack-ceremony close handlers also feed into the same overlay (pack refund tracked via `lastPackRefund` in AppShell). Reduced-motion mode collapses inter-beat timing to 280 ms, skips the ember shower, and disables animations via `.reward-cinema-overlay.reduced-motion`. New `src/components/RewardCinemaOverlay.test.tsx` (jsdom + @testing-library/react) covers null/empty sequences, beat advancement on a fake timer, the explicit Continue requirement, and reduced-motion behaviour via mocked `matchMedia`; `npm run lint`, 72 tests, and `npm run build` all green.) |
| **3X** | First-launch onboarding tour with spotlight cutouts; replay from Settings | Medium | new OnboardingTour.tsx, App.tsx, SettingsScreen.tsx | ✅ done — `OnboardingTour` overlay drives a 5-step spotlight walkthrough (home tiles → Collection nav → queue button → battle hand → Settings nav) with radial-gradient veil cutouts and a parchment caption that adjusts placement per viewport; missing targets fall back to a centered caption. AppShell owns `tourVisible` + `startOnboardingTour`/`dismissOnboardingTour(reason)`, auto-fires once on the first authenticated landing on Home (gated by `setupRequired`/`loggedIn`), persists completion via `STORAGE_KEYS.firstLaunch`, and Settings now exposes a “Replay onboarding tour” button. Steps pair with `feedback('nav')`, finale plays `playSound('questComplete')`, and reduced-motion / `soundEnabled` are honoured throughout. Covered by `OnboardingTour.test.tsx`. |
| **3Y** | Touch swipe gesture between adjacent primary scenes, with rail-aware guards | Medium | App.tsx, App.css, utils.ts | 🟡 planned |
| **3Z** | Accessibility/reduced-motion parity for everything added in 3Q–3Y + haptics toggle | Highest | App.css, audio.ts, ambient.ts, feedback.ts, SettingsScreen.tsx | 🟡 planned |

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Socket event handlers split across contexts may fire in wrong order | AppContext handles connection; other contexts register listeners after socket is available via useEffect dependency on socketClientRef |
| Circular dependencies between contexts (Game needs Profile's deckConfig, Queue needs Game's startMatch) | Provider nesting order ensures inner providers can read outer context. Use refs for callbacks to avoid stale closures |
| Derived state from serverProfile used in multiple contexts | Keep serverProfile + setServerProfile in AppContext (the source). ProfileContext computes derived values from it. Other contexts read what they need |
| Screen split may break CSS selectors that assume old class names | Search-and-replace CSS class references; use `grep` to find all `.home-*`, `.deck-*`, `.vault-*`, `.ops-*` usages |
| Bundle size increase from more files | Minimal risk — React contexts add negligible overhead. Vite tree-shakes unused exports |
| Transition animations causing layout shift | Use `position: absolute` for entering/exiting screens, `will-change: transform` for GPU acceleration |
| ~70 new SVGs bloating the public folder | SVGs are tiny (1-5 kB each). Total addition ~200 kB uncompressed, ~50 kB gzipped. Browser caches aggressively with service worker |
| SVG backgrounds not covering all viewport sizes | Use `viewBox` + `preserveAspectRatio="xMidYMid slice"` + CSS `background-size: cover`. Test at 375px and 2560px |
| 9-slice SVG button frames not scaling cleanly | Use CSS `border-image-slice` with proper inset values. Fallback: layered box-shadow approach if border-image has browser quirks |
| Pack ceremony animation too complex for low-end devices | Gate the full ceremony on `prefers-reduced-motion`. Reduced-motion path: instant flip, no shake, no glow burst. Also use `will-change: transform` sparingly and remove after animation completes |
| Font licensing for fantasy display font | Generate fantasy-style text as SVG `<text>` paths in the asset generator — self-contained, zero licensing. Alternatively, use CSS `text-shadow` stacking to create a pseudo-embossed fantasy look with system fonts |
| Web Audio sounds harsh or inconsistent across browsers | Use triangle waves as primary (softest), keep volumes ≤ 0.03, test on Safari (AudioContext resume quirk already handled in audio.ts) |

---

## Active Files for the Current Polish Pass

- `src/App.css` — shared chrome primitives, button/panel styling, battle density, nav layout, touch-callout suppression
- `src/App.tsx` — socket lifecycle, rejoin recovery, auth shell controls, long-press behavior
- `src/screens/HomeScreen.tsx` — dashboard density, toast placement, nav-tile framing cleanup
- `src/screens/PlayScreen.tsx` — queue/search compression and CTA visibility
- `src/screens/BattleScreen.tsx` — one-screen battle layout and HUD cleanup
- `src/screens/CollectionScreen.tsx`, `src/screens/SocialScreen.tsx`, `src/screens/ShopScreen.tsx`, `src/screens/SettingsScreen.tsx` — viewport efficiency pass
- `src/components/NavBar.tsx` — bottom-nav shell cleanup
- `server/server.js`, `server/game-room.js` — reconnect, rejoin, and grace-period hardening

---

## Pre-Commit Checklist (apply after every step)

- [ ] `npm run build` passes
- [ ] `npm test` passes (45/45)
- [ ] `npm run lint` passes
- [ ] No `// TODO`, stubs, or placeholders
- [ ] All screens render correctly
- [ ] Navigation between all screens works
- [ ] Battle flow (start → play → end) works end-to-end
- [ ] Auth flow (login → logout → login) works
- [ ] `prefers-reduced-motion` respected on new animations
- [ ] Mobile viewport (375px) tested for new UI
- [ ] Primary screens use the viewport effectively with minimal vertical scrolling
- [ ] Long-press inspect works without browser/system context menus or touch callouts
