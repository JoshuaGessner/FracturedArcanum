# Fractured Arcanum — Rewarded Ad System Implementation Plan

> **Purpose:** Full implementation plan for the opt-in rewarded-video ad system.
> Drafted: 2026-05-11. Use this document as the session brief for the implementing agent.
> See also: [Economy Balance](ECONOMY_BALANCE.md) | [Monetization Plan](monetization-plan.md)

---

## Overview

Add an opt-in **Watch Ads** rewarded-video system to the Shop's Overview (hub) tab. A small "Watch Ad" button sits in the top-right corner of the hub. Clicking it opens a dedicated `ads` subview within the shop's existing navigation pattern. Players may watch one ad every **2 hours**, up to **5 times per day**, with a global 24-hour reset. Each successive ad in a day pays more Shards to reward continued engagement.

---

## Part 1 — Ad Platform Setup (Accounts & Services)

### Recommended Platform: AppLixir (Primary)

AppLixir is purpose-built for HTML5/web games and PWAs. It provides rewarded video with a simple JavaScript API, no native app wrapper required, and has a self-serve publisher dashboard suitable for independent studios.

**AppLixir Account Setup:**
1. Go to [applixir.com](https://www.applixir.com) → click **Get Started** → select **Publisher**.
2. Fill in your site URL (`https://your-game-domain.com`), category (Card Game / Strategy), and content rating (everyone/teen).
3. Submit for approval. Approval typically takes 1–3 business days. You will receive an email with your **App/Game Zone ID** and **Publisher Code (pcode)**.
4. In the AppLixir dashboard, create a **Placement** of type "Rewarded Video." Name it `shop_reward`. Copy the Zone ID for this placement.
5. In the dashboard's **Ad Settings**, configure the minimum ad fill floor (recommended $0.01 CPM initially) and enable "Safe Ads" filtering to keep content appropriate.
6. Download or note the CDN script URL from the Dashboard → Integration → HTML5 tab. It will look like `https://cdn.applixir.com/applixir.sdk.min.js`.
7. Keep your Zone ID and pcode in server-side `.env` / environment config — do not hardcode in the client bundle. Pass them as `VITE_AD_*` env vars at build time (they appear in the HTML anyway, but centralising them avoids scatter).

**AppLixir Payout:**
- Minimum payout is $10 via PayPal or bank wire.
- Revenue reports are in the dashboard under Reports → Daily.
- eCPM for HTML5 web games typically $0.50–$3.00 depending on geography. Rewarded video earns higher than display.

### Alternative Platform: Google IMA SDK (Upgrade Path)

If traffic grows beyond ~50k daily active sessions, upgrade to Google's Interactive Media Ads (IMA) SDK + AdSense for Games (AFG). This requires:

1. An approved Google AdSense account ([adsense.google.com](https://adsense.google.com)).
2. Apply for **AdSense for Games** through your AdSense account under Products. Approval requires existing meaningful traffic (typically 1,000+ daily users) and Google editorial review.
3. Once approved, create a Rewarded ad unit in the AdSense console → Ad units → New ad unit → Rewarded.
4. Get the ad unit tag URL (VAST/VPAID endpoint) and use the IMA SDK (`https://imasdk.googleapis.com/js/sdkloader/ima3.js`) to load and play ads.
5. The `src/adService.ts` abstraction layer (Part 5) makes swapping AppLixir → IMA SDK a one-file change.

---

## Part 2 — Economy Balance

### Ad Reward Schedule

| Ad # (today) | Reward | Thematic name |
|---|---|---|
| 1st watch | **5 Shards** | Rune Flicker |
| 2nd watch | **8 Shards** | Ember Spark |
| 3rd watch | **12 Shards** | Arcane Pulse |
| 4th watch | **15 Shards** | Void Surge |
| 5th watch | **20 Shards** | Rift Blessing |
| **Daily max** | **60 Shards** | — |

**Balance math:**
- Casual player baseline: **85 shards/day** (matches + daily vault)
- Max ad bonus (all 5): **60 shards/day** (~70% bonus). Realistic (2–3 ads/day): **13–25 shards**
- Realistic weekly addition: ~91–175 shards → casual progression shifts from 7–8 months to ~5.5–6.5 months — still within the target 4–8 month corridor
- The 5th ad (20 Shards) equals a single match win — feels earned, not trivial
- 2-hour cooldown ensures ads are spread across real play sessions, not batch-harvested
- Cooldown and daily cap are **server-authoritative** — clients never self-report reward eligibility

### Documentation Updates Required
- `docs/ECONOMY_BALANCE.md` §2 — add "Ad reward" row to the Earning Rates table, document daily max, schedule, and weekly impact
- `docs/ECONOMY_BALANCE.md` §7 — add `AD_REWARD_SCHEDULE` to Income Levers table
- `docs/monetization-plan.md` — add rewarded ads as a new approved income source (opt-in, non-aggressive, Covenant of Fair Play compliant)
- `docs/ECONOMY_BALANCE.md` §8 — add metric: "Ad views per day (active player) | 0–5 | >5 = system broken"

---

## Part 3 — Database Changes (`server/db/economy.js`)

### Schema migration

Add three new columns to `player_profiles`. Wrap each `ALTER TABLE` in a try/catch so subsequent server starts (when columns already exist) do not crash:

```sql
ALTER TABLE player_profiles ADD COLUMN ad_watch_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN ad_watch_day   TEXT    NOT NULL DEFAULT '';
ALTER TABLE player_profiles ADD COLUMN ad_last_watch  TEXT    NOT NULL DEFAULT '';
```

- `ad_watch_count` — number of ads watched on `ad_watch_day` (0–5)
- `ad_watch_day` — ISO date string `'YYYY-MM-DD'` for the current ad cycle
- `ad_last_watch` — ISO datetime of the last completed ad (for cooldown enforcement)

Add these migrations inside the existing `db.exec()` block (or individual try/catches) after the main schema block.

### New constants (near `WIN_SHARDS`)

```js
const AD_COOLDOWN_MS       = 2 * 60 * 60 * 1000          // 2 hours
const AD_MAX_DAILY         = 5
const AD_REWARD_SCHEDULE   = [5, 8, 12, 15, 20]           // indexed by watch count 0–4
```

### New exported function: `recordAdWatch(accountId)`

Logic:
1. Load profile. If not found, return `{ ok: false, error: 'Profile not found.' }`.
2. Compute `todayKey = new Date().toISOString().slice(0, 10)`.
3. If `profile.ad_watch_day !== todayKey`, reset: `ad_watch_count = 0`, `ad_watch_day = todayKey`.
4. If `ad_watch_count >= AD_MAX_DAILY`, return `{ ok: false, error: 'Daily ad limit reached.' }`.
5. If `ad_last_watch` is set, compute `msSinceLast = Date.now() - new Date(ad_last_watch).getTime()`. If `msSinceLast < AD_COOLDOWN_MS`, return `{ ok: false, error: 'Too soon.', cooldownRemaining: AD_COOLDOWN_MS - msSinceLast }`.
6. `amount = AD_REWARD_SCHEDULE[ad_watch_count]` (current count before incrementing).
7. Run a SQLite transaction:
   - `_grantShards.run(amount, amount, accountId)` (reuse existing prepared statement)
   - `UPDATE player_profiles SET ad_watch_count = ad_watch_count + 1, ad_watch_day = ?, ad_last_watch = datetime('now') WHERE account_id = ?`
8. Reload profile and return:
   ```js
   {
     ok: true,
     amount,
     newBalance: refreshed.shards,
     watchCount: refreshed.ad_watch_count,
     maxDaily: AD_MAX_DAILY,
     nextAmount: AD_REWARD_SCHEDULE[refreshed.ad_watch_count] ?? null,
     cooldownMs: AD_COOLDOWN_MS
   }
   ```

### Update `getProfile()` mapping

Add `ad_watch_count`, `ad_watch_day`, and `ad_last_watch` to the profile row-mapping, and compute:
- `adWatchesToday` (reset if day changed)
- `adNextAvailableAt` — `null` if cooldown expired, otherwise epoch ms
- `adDailyMax: AD_MAX_DAILY`
- `adRewardSchedule: AD_REWARD_SCHEDULE`

Export `recordAdWatch` in the server's import list.

---

## Part 4 — Server API (`server/server.js`)

### New import

Add `recordAdWatch` to the destructured import from `'./db.js'`.

### New route: `POST /api/me/ad-reward`

Place immediately after the `/api/me/daily` route (currently around line 955):

```js
app.post('/api/me/ad-reward',
  rateLimit({ windowMs: 2 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false }),
  requireAuth(),
  (req, res) => {
    const result = recordAdWatch(req.accountId)
    if (!result.ok) return res.status(400).json(result)
    res.json(result)
  }
)
```

Rate limit: 3 requests per 2 minutes per IP (DDoS/spam shield — the DB cooldown is the real gate).
The server does not independently verify whether an ad played on the client; AppLixir's server-to-server postback (see Part 9) is the optional hardening step.

---

## Part 5 — Client Ad Service (`src/adService.ts`)

Create a new file `src/adService.ts`. This is a singleton module that abstracts the ad SDK so the rest of the app is vendor-agnostic. Swapping AppLixir → IMA SDK means changing only this file.

```typescript
export type AdResult = 'completed' | 'skipped' | 'error' | 'unavailable'

/**
 * Lazily inject the AppLixir SDK <script> tag from the CDN URL.
 * SDK URL, Zone ID, and pcode come from VITE_ env vars set at build time.
 * Returns true when the SDK is ready, false on timeout.
 */
export async function loadAdSdk(): Promise<boolean>

/**
 * Show a rewarded ad.
 * Returns 'completed' only when the user watches to the end and the
 * completion callback fires. Returns 'skipped' | 'error' | 'unavailable'
 * for all other outcomes.
 */
export async function showRewardedAd(): Promise<AdResult>
```

### Environment variables (add to `.env` and `.env.example`)

```
VITE_AD_ZONE_ID=your_applixir_zone_id
VITE_AD_PCODE=your_applixir_pcode
VITE_AD_ENABLED=true
```

`VITE_AD_ENABLED=false` disables the feature entirely in development/test without touching code.

**Do not** add an inline `<script>` tag to `index.html`. The SDK is lazy-loaded by `adService.ts` on the first `showRewardedAd()` call, keeping it out of the initial parse budget.

---

## Part 6 — Client Type Changes (`src/types.ts`)

```typescript
export type AdRewardState = {
  watchesToday: number
  maxDaily: number
  nextAvailableAt: number | null   // epoch ms; null means available now
  rewardSchedule: number[]         // [5, 8, 12, 15, 20]
  nextReward: number | null        // shards for the next watch; null = daily cap reached
}
```

Add optional field to `ServerProfile`:

```typescript
adReward?: AdRewardState
```

---

## Part 7 — ProfileProvider / Context Changes (`src/contexts/`)

### ProfileProvider

- When `GET /api/me` loads, parse `adReward` from the response and store as `adRewardState: AdRewardState | null`.
- Expose `adRewardState` and `handleWatchAd` from the provider.
- `handleWatchAd` async handler:
  1. If `VITE_AD_ENABLED` is falsy, show toast "Ads not available in this build."
  2. Set local `adPlaying = true` (disables UI during playback).
  3. Await `adService.showRewardedAd()`.
  4. If `'completed'`: `POST /api/me/ad-reward`. On success, update `adRewardState` and `shards` from the response. Present reward cinema with a `'ad_reward'`-scoped `RewardBeat` ("Shards Granted"). Show toast: `+${amount} Shards — Rift Blessing`.
  5. If `'skipped'`: toast "Ad skipped — no reward granted."
  6. If `'error'` or `'unavailable'`: toast "Ad unavailable — try again shortly."
  7. Always set `adPlaying = false` in a `finally` block.
  8. All state transitions are driven by the server response, never by client assumptions.

### AppShellContext (`src/AppShellContext.ts`)

Add to `AppShellContextValue`:

```typescript
handleWatchAd: () => Promise<void>
```

Wire through the same way as `handleClaimDailyReward` (delegated from `AppShell`, sourced from `ProfileProvider`).

### `useProfile` hook

Expose `adRewardState` alongside existing profile fields.

---

## Part 8 — ShopScreen UI Changes (`src/screens/ShopScreen.tsx`)

### 1. Extend `ShopSubview` type

```typescript
type ShopSubview = 'hub' | 'vault' | 'packs' | 'themes' | 'borders' | 'breakdown' | 'ads'
```

### 2. Add `viewLabel` case

```typescript
shopSubview === 'ads' ? 'Watch Ads' : ...
```

### 3. Watch Ad button in the hub header (top-right of overview)

The hub header (`shop-market-ledger`) has a title block and resource strip. Add the Watch Ad button as a third flex child with `margin-left: auto` (or `flex-shrink: 0; align-self: flex-start`) so it floats right without disrupting the existing layout.

Button requirements:
- Class: `shop-ad-btn` + `ad-ready` when cooldown is up
- Size class: `mini`
- Label: `▶ Watch Ad`
- Sub-label badge: `3 left today` (or `5/5` when capped)
- Shows a live countdown when in cooldown (local `setInterval`, cleaned up on unmount)
- Disabled states: daily cap reached | in cooldown | not logged in | ad playing
- Click action: `setShopSubview('ads')`

On mobile (< 640px), if the header is too cramped, the button drops below the resource strip using CSS `order: 3` in a flex-wrap context.

### 4. Add `'ads'` to `shopNav`

```typescript
{ id: 'ads', label: 'Watch Ads' }
```

Provides a second keyboard/screen-reader entry point alongside the header button.

### 5. Ads subview panel

Modeled after the vault panel for visual consistency:

- `renderShopToolbar('Watch Ads', '${watchCount}/${maxDaily} today')` — identical toolbar pattern with Back button
- **Status card** (mirrors `reward-vault-stage`):
  - "Daily Ad Reward" heading
  - Next reward amount prominently: `+${nextReward} Shards`
  - If in cooldown: live "Available in X:XX" countdown
  - If daily cap reached: "Come back tomorrow — vault recharged at midnight"
- **Watch button**: `<button className="primary reward-vault-primary" onClick={handleWatchAd} disabled={...}>Watch Ad for +{nextReward} Shards</button>`
- **Ascending reward tier grid** (5 chips, mirrors `reward-vault-rule-grid`):
  ```
  1st: +5   2nd: +8   3rd: +12   4th: +15   5th: +20
  ```
  Watched tiers: filled/checkmark style. Next tier: amber highlight. Future tiers: dim.
- **Fine-print note** (`.note` class): "Opt-in only. Rewards reset daily at midnight UTC. One ad every 2 hours, up to 5 per day."

**Navigation safety:**
- Back button uses existing `ghost mini subview-back-btn` → `setShopSubview('hub')`
- Back button and Watch button are both disabled while `adPlaying === true`
- All ad state lives in the provider, so navigating away and back preserves the UI state exactly
- Local `adPlaying: boolean` state prevents double-tap and mid-ad navigation

---

## Part 9 — CSS Changes (`src/App.css`)

Add all new styles in the **Screen-specific density blocks** section (~lines 2120–3200), near the existing shop block.

### Watch Ad hub button

```css
.shop-ad-btn {
  flex-shrink: 0;
  align-self: flex-start;
  font-size: var(--font-xs);
  border-radius: var(--radius-sm);      /* 6px — never pill */
  padding: 0.3rem 0.6rem;
  border: 1px solid rgba(251,191,36,0.4);
  background: linear-gradient(135deg, rgba(8,14,30,0.68), rgba(23,31,57,0.54));
  color: var(--text-dim);
  font-weight: 800;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.shop-ad-btn:hover:not(:disabled) {
  border-color: rgba(251,191,36,0.8);
  color: #fff7d6;
}
.shop-ad-btn.ad-ready {
  border-color: rgba(251,191,36,0.7);
  color: #fbbf24;
}
.shop-ad-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
```

### Ads subview panel (mirrors vault panel grammar)

```css
.shop-ads-panel { }               /* wrapper */
.shop-ad-stage { }                /* mirrors .reward-vault-stage */
.shop-ad-medallion { }            /* "+N Shards" display, mirrors .reward-vault-medallion */
.shop-ad-cooldown-label { }       /* countdown timer */
.shop-ad-tier-grid { }            /* 5-chip row */
.shop-ad-tier-chip { }            /* individual tier */
.shop-ad-tier-chip.is-done { }    /* completed tier */
.shop-ad-tier-chip.is-next { }    /* next/highlighted tier — amber accent */
.shop-ad-tier-chip.is-future { }  /* dim future tiers */
```

### Responsive

At `@media (max-width: 640px)`: `.shop-ad-btn` gets `order: 3` in a flex-wrap `.shop-market-ledger` so it drops to its own row rather than squeezing the resource strip.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .shop-ad-btn { transition: none; }
  .shop-ad-tier-chip.is-next { animation: none; }
}
```

---

## Part 10 — CSP Update (`server/server.js`)

Update the Helmet `contentSecurityPolicy` `directives` to allow AppLixir's CDN:

```js
'script-src':  [...existing..., 'https://cdn.applixir.com'],
'img-src':     [...existing..., 'https://cdn.applixir.com', 'data:'],
'frame-src':   [...existing..., 'https://cdn.applixir.com'],
'connect-src': [...existing..., 'https://cdn.applixir.com', 'https://api.applixir.com'],
```

---

## Part 11 — Testing

### ShopScreen tests (`src/screens/ShopScreen.test.tsx`)

1. Renders Watch Ad button in hub when `activeScreen === 'shop'`
2. Clicking button navigates to the `ads` subview
3. Back button from `ads` subview returns to hub
4. Button is disabled when `adRewardState.watchesToday === 5` (daily cap)
5. Button is disabled when `adRewardState.nextAvailableAt` is a future timestamp (cooldown)
6. Shows correct next reward amount at each schedule position (e.g. position 2 → `+12 Shards`)

### DB function tests

- `recordAdWatch` resets count when `ad_watch_day` differs from today
- `recordAdWatch` enforces 2-hour cooldown
- `recordAdWatch` enforces daily cap of 5
- `recordAdWatch` returns correct ascending reward amounts for each position

---

## Part 12 — Documentation Updates

1. **`docs/ECONOMY_BALANCE.md` §2** — Add "Ad reward | 5–20 shards (ascending) | Up to 5×/day (2h cooldown) | 0–60" to Earning Rates table
2. **`docs/ECONOMY_BALANCE.md` §2** — Update "Weekly Income Model" section with ad-inclusive scenario
3. **`docs/ECONOMY_BALANCE.md` §7** — Add `AD_REWARD_SCHEDULE` to Income Levers table
4. **`docs/ECONOMY_BALANCE.md` §8** — Add metric: "Ad views per day (active player) | 0–5 | >5 = system broken"
5. **`docs/monetization-plan.md`** — Add "Phase 2 — Ad Revenue" section documenting opt-in rewarded ads, platform choice, policy alignment, and Covenant of Fair Play compliance statement

---

## Part 13 — Implementation Order

Execute in this order within the implementation session:

1. **DB** — Add migration columns and `recordAdWatch()` to `server/db/economy.js`. Run `npm test` to verify existing tests pass.
2. **Server** — Add `POST /api/me/ad-reward` route and import to `server/server.js`. Smoke-test with curl.
3. **Types** — Add `AdRewardState` and update `ServerProfile` in `src/types.ts`.
4. **Ad Service** — Create `src/adService.ts` with AppLixir wrapper. Add `VITE_AD_*` vars to `.env.example`.
5. **Context** — Add `adRewardState`, `handleWatchAd` to `ProfileProvider`; wire through `AppShellContext`.
6. **Constants** — Add `AD_REWARD_SCHEDULE`, `AD_MAX_DAILY`, `AD_COOLDOWN_MS` to `ECONOMY_REWARDS` in `src/constants.ts`.
7. **ShopScreen** — Add subview type, Watch Ad hub button, nav strip entry, and full ads subview panel.
8. **CSS** — Add all new styles in the shop density block of `src/App.css`.
9. **CSP** — Update Helmet directives in `server/server.js`.
10. **Tests** — Add unit tests for `recordAdWatch` and ShopScreen ad button behaviour.
11. **Docs** — Update `ECONOMY_BALANCE.md` and `monetization-plan.md`.
12. **Build & QA** — `npm run build:engine` → `npm run build` → `npm test` → `npm run lint` → `npm run qa:viewport`.

---

## Part 14 — Optional Hardening (Phase 2)

- **Server-to-server postback** — AppLixir supports a postback URL configured in the dashboard that hits your server on ad completion with a signed token. Configure it to `POST /api/ad-postback?token=...&result=complete`. The server then issues a one-time-use signed token the client must submit with `/api/me/ad-reward`. This prevents calling the reward endpoint without watching an ad.
- **Analytics tracking** — Emit `trackAnalyticsEvent()` calls for `ad_started`, `ad_completed`, `ad_skipped`, `ad_error` to the existing analytics store. Gives visibility into fill rate and completion rate.
- **Admin dashboard metric** — Add "Ad completes today" to the admin overview endpoint and admin dashboard UI.
