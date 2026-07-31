/**
 * Shards, packs, card borders, and shard breakdown.
 *
 * Everything that moves currency or collection quantity.
 */
import { randomBytes, randomInt } from 'node:crypto'
import { CARD_LIBRARY, MAX_COPIES as GAME_MAX_COPIES, MAX_LEGENDARY_COPIES } from '../game.js'
import { QUEST_DEFINITIONS, QUEST_TIERS, difficultyMeets, getQuestDefinition, renderQuestDescription } from '../quest-definitions.js'
import { QUEST_CHAINS, chainTier, chainTierLabel, getQuestChain, isChainExhausted, legacyChainMigrations } from '../quest-chains.js'
import { db, prepare, transaction } from './connection.js'
import { DECK_CARD_ID_RE, _getProfile, _updateTheme, buildStarterCollection, getProfile, listDecks, normalizeOwnedCards } from './profiles.js'

// ─── Economy operations (server-authoritative) ──────────────────────────────

const THEME_COSTS = { royal: 0, ember: 120, moon: 180 }
const WIN_SHARDS = 30
const LOSS_SHARDS = 10
const DAILY_SHARDS = 25
const WIN_RATING = 25
const LOSS_RATING = 15
const RATING_FLOOR = 1000

function calculateMatchEconomy(profile, mode, result) {
  let shardsEarned = 0
  let ratingDelta = 0
  let newStreak = profile.streak
  const ratingEligible = mode === 'duel'

  if (result === 'win') {
    shardsEarned = WIN_SHARDS
    ratingDelta = ratingEligible ? WIN_RATING : 0
    newStreak = profile.streak + 1
    if (newStreak > 2) {
      shardsEarned += Math.min(20, (newStreak - 2) * 5)
    }
  } else if (result === 'loss') {
    shardsEarned = LOSS_SHARDS
    ratingDelta = ratingEligible
      ? Math.max(RATING_FLOOR, profile.season_rating - LOSS_RATING) - profile.season_rating
      : 0
    newStreak = 0
  }

  return { shardsEarned, ratingDelta, newStreak }
}

const FARM_GATED_MATCH_REASONS = new Set([
  'surrender',
  'forfeit',
  'disconnect_forfeit',
  'opponent_disconnected',
])

function calculateAuthoritativeMatchEconomy(profile, mode, result, reason, turns) {
  if (mode === 'unranked') {
    return {
      shardsEarned: 0,
      ratingDelta: 0,
      newStreak: profile.streak,
      questEligible: false,
      rewardEligible: false,
      recordEligible: false,
    }
  }

  if (reason === 'server_abort' || reason === 'timeout' || (mode === 'ai' && reason !== 'completed' && reason !== 'normal')) {
    return {
      shardsEarned: 0,
      ratingDelta: 0,
      newStreak: profile.streak,
      questEligible: false,
      rewardEligible: false,
      recordEligible: false,
    }
  }

  const base = calculateMatchEconomy(profile, mode, result)
  const gatedEarlyEnd = FARM_GATED_MATCH_REASONS.has(reason) && turns < 2
  if (gatedEarlyEnd) {
    return {
      shardsEarned: 0,
      ratingDelta: base.ratingDelta,
      newStreak: profile.streak,
      questEligible: false,
      rewardEligible: false,
      recordEligible: true,
    }
  }

  return {
    ...base,
    questEligible: true,
    rewardEligible: result !== 'draw',
    recordEligible: true,
  }
}

const _grantShards = prepare(`
  UPDATE player_profiles
  SET shards = shards + ?, total_earned = total_earned + MAX(0, ?), updated_at = datetime('now')
  WHERE account_id = ?
`)

const _deductShards = prepare(`
  UPDATE player_profiles
  SET shards = shards - ?, updated_at = datetime('now')
  WHERE account_id = ? AND shards >= ?
`)

const _addOwnedTheme = prepare(`
  UPDATE player_profiles
  SET owned_themes = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)

const _setDailyClaim = prepare(`
  UPDATE player_profiles
  SET last_daily = ?, shards = shards + ?, total_earned = total_earned + ?, updated_at = datetime('now')
  WHERE account_id = ? AND COALESCE(last_daily, '') <> ?
`)

const _updateRating = prepare(`
  UPDATE player_profiles
  SET season_rating = MAX(?, season_rating + ?), updated_at = datetime('now')
  WHERE account_id = ?
`)

const _updateRecord = prepare(`
  UPDATE player_profiles
  SET wins = wins + ?, losses = losses + ?, streak = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)

const _insertMatch = prepare(`
  INSERT INTO match_log (id, account_id, opponent, mode, result, turns, shards_earned, rating_delta)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const _insertQuestChain = prepare(`
  INSERT OR IGNORE INTO player_quest_chains (account_id, chain_id) VALUES (?, ?)
`)

const _listQuestChains = prepare(`
  SELECT * FROM player_quest_chains WHERE account_id = ?
`)

const _setQuestChainProgress = prepare(`
  UPDATE player_quest_chains
  SET progress = ?, updated_at = datetime('now')
  WHERE account_id = ? AND chain_id = ?
`)

// Guarding on the tier the caller believed was current makes a double claim a
// no-op rather than a double payout.
const _claimQuestChainTier = prepare(`
  UPDATE player_quest_chains
  SET claimed_tier = claimed_tier + 1, updated_at = datetime('now')
  WHERE account_id = ? AND chain_id = ? AND claimed_tier = ?
`)

const _seedQuestChain = prepare(`
  UPDATE player_quest_chains
  SET progress = MAX(progress, ?), claimed_tier = MAX(claimed_tier, ?), updated_at = datetime('now')
  WHERE account_id = ? AND chain_id = ?
`)

const _getLegacyPermanentQuest = prepare(`
  SELECT * FROM player_quests WHERE account_id = ? AND quest_id = ? AND period_key = 'ever'
`)

const _listLegacyRotatingQuests = prepare(`
  SELECT * FROM player_quests WHERE account_id = ? AND period_key = ?
`)

const _deleteLegacyRotatingQuests = prepare(`
  DELETE FROM player_quests WHERE account_id = ? AND period_key <> 'ever'
`)

const _listQuestSlots = prepare(`
  SELECT * FROM player_quest_slots WHERE account_id = ?
`)

const _assignQuestSlot = prepare(`
  INSERT INTO player_quest_slots
    (account_id, cadence, slot_index, quest_id, target, reward_shards, progress, rerolled, assigned_key, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(account_id, cadence, slot_index) DO UPDATE SET
    quest_id      = excluded.quest_id,
    target        = excluded.target,
    reward_shards = excluded.reward_shards,
    progress      = excluded.progress,
    claimed       = 0,
    rerolled      = excluded.rerolled,
    assigned_key  = excluded.assigned_key,
    assigned_at   = datetime('now'),
    expires_at    = excluded.expires_at,
    completed_at  = NULL,
    updated_at    = datetime('now')
`)

const _setQuestSlotProgress = prepare(`
  UPDATE player_quest_slots
  SET progress = ?, completed_at = COALESCE(completed_at, ?), updated_at = datetime('now')
  WHERE account_id = ? AND cadence = ? AND slot_index = ?
`)

const _claimQuestSlot = prepare(`
  UPDATE player_quest_slots
  SET claimed = 1, updated_at = datetime('now')
  WHERE account_id = ? AND cadence = ? AND slot_index = ? AND claimed = 0
`)

// The guard in the WHERE clause is what makes the free reroll single-use: a
// second attempt on the same day changes zero rows.
const _spendDailyReroll = prepare(`
  UPDATE player_profiles SET quest_reroll_daily_key = ?, updated_at = datetime('now')
  WHERE account_id = ? AND quest_reroll_daily_key <> ?
`)

const _spendWeeklyReroll = prepare(`
  UPDATE player_profiles SET quest_reroll_weekly_key = ?, updated_at = datetime('now')
  WHERE account_id = ? AND quest_reroll_weekly_key <> ?
`)

const ROTATING_CADENCES = ['daily', 'weekly']
const QUEST_SLOT_COUNT = { daily: 3, weekly: 3 }

// A daily quest outlives its own day so a skipped evening does not erase
// partial progress. Slots still refill at most once per period, so the extra
// lifetime buys forgiveness, not extra income.
const DAILY_QUEST_LIFETIME_DAYS = 3

const MS_PER_DAY = 86_400_000

// Epoch day 4 (1970-01-05) was the first Monday, so anchoring week buckets
// there yields Monday-aligned weeks that stay monotonic across year ends. The
// previous floor(dayOfYear / 7) scheme restarted at January 1 and produced a
// one-or-two day "week 53" every December.
const FIRST_MONDAY_EPOCH_DAY = 4

function epochDay(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY)
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function weekStartEpochDay(date = new Date()) {
  return Math.floor((epochDay(date) - FIRST_MONDAY_EPOCH_DAY) / 7) * 7 + FIRST_MONDAY_EPOCH_DAY
}

function weekKey(date = new Date()) {
  return `w${new Date(weekStartEpochDay(date) * MS_PER_DAY).toISOString().slice(0, 10)}`
}

export function questPeriodKey(cadence, date = new Date()) {
  if (cadence === 'daily') return dayKey(date)
  if (cadence === 'weekly') return weekKey(date)
  return 'ever'
}

// When a quest assigned right now stops being claimable. Weeklies run to the
// Monday boundary; dailies get the forgiveness window above.
export function questExpiresAt(cadence, date = new Date()) {
  if (cadence === 'daily') {
    return new Date((epochDay(date) + DAILY_QUEST_LIFETIME_DAYS) * MS_PER_DAY).toISOString()
  }
  if (cadence === 'weekly') {
    return new Date((weekStartEpochDay(date) + 7) * MS_PER_DAY).toISOString()
  }
  return null
}

function questPool(cadence, tier = null) {
  return QUEST_DEFINITIONS.filter(
    (quest) => quest.cadence === cadence && (tier === null || quest.tier === tier),
  )
}

// Slot 0 draws a light objective, slot 1 a standard one, slot 2 a hard one, so
// every board offers something finishable in one sitting alongside something
// worth chasing. Marvel Snap's normal/hard pairing, spread across three slots.
function tierForSlot(slotIndex) {
  return QUEST_TIERS[slotIndex % QUEST_TIERS.length]
}

function rollVariant(quest) {
  return quest.variants[randomInt(quest.variants.length)]
}

function deckSize(deckConfig) {
  return Object.values(deckConfig ?? {}).reduce((sum, count) => sum + Number(count ?? 0), 0)
}

/**
 * Progress for objectives that describe a state rather than a tally.
 *
 * "Own 30 distinct cards" cannot be derived from an event stream — breaking a
 * card down would have to decrement it — so these read the profile directly.
 * Returns null for ordinary counting objectives.
 */
function derivedQuestProgress(objectiveType, profile) {
  if (objectiveType === 'build_deck') return deckSize(profile.deck_config)
  if (objectiveType === 'collect_cards') return Object.keys(profile.owned_cards ?? {}).length
  return null
}

// A slot still belongs to the player while it is unclaimed and unexpired —
// including once it is complete, so a finished quest waits to be collected
// instead of being recycled out from under them.
function isSlotHeld(row, nowIso) {
  return !row.claimed && row.expires_at > nowIso
}

// Refills draw from the rest of the tier's pool so a board never shows the
// same objective twice. Falling back to the whole cadence keeps a small tier
// from wedging assignment.
function pickSlotQuest(cadence, tier, excludeIds) {
  const tiered = questPool(cadence, tier).filter((quest) => !excludeIds.has(quest.id))
  if (tiered.length > 0) return tiered[randomInt(tiered.length)]

  const anyTier = questPool(cadence).filter((quest) => !excludeIds.has(quest.id))
  if (anyTier.length > 0) return anyTier[randomInt(anyTier.length)]

  const pool = questPool(cadence)
  return pool.length > 0 ? pool[randomInt(pool.length)] : null
}

/**
 * Bring an account's rotating quest board up to date.
 *
 * A slot refills only when it is free (claimed or expired) *and* has not
 * already been refilled this period. That single rule is what caps income:
 * without it, claiming a daily would immediately hand out another one and the
 * daily faucet would become unbounded.
 */
function ensureQuestSlots(accountId, date = new Date()) {
  const rows = _listQuestSlots.all(accountId)
  const nowIso = date.toISOString()
  const pending = []

  for (const cadence of ROTATING_CADENCES) {
    const periodKey = questPeriodKey(cadence, date)
    const expiresAt = questExpiresAt(cadence, date)
    const bySlot = new Map(
      rows.filter((row) => row.cadence === cadence).map((row) => [row.slot_index, row]),
    )

    // Accounts created before the slot table carry in-flight progress in the
    // old period-keyed rows. Seed from them once so nobody loses a quest they
    // were part-way through at deploy time.
    const legacy = bySlot.size === 0
      ? _listLegacyRotatingQuests.all(accountId, periodKey).filter((row) => row.cadence === cadence)
      : []

    const held = new Set()
    for (const row of bySlot.values()) {
      if (isSlotHeld(row, nowIso)) held.add(row.quest_id)
    }

    for (let slotIndex = 0; slotIndex < QUEST_SLOT_COUNT[cadence]; slotIndex += 1) {
      const row = bySlot.get(slotIndex)
      if (row && isSlotHeld(row, nowIso)) continue
      if (row && row.assigned_key === periodKey) continue

      const carried = legacy[slotIndex]
      const definition = (carried && getQuestDefinition(carried.quest_id))
        || pickSlotQuest(cadence, tierForSlot(slotIndex), held)
      if (!definition) continue

      const variant = rollVariant(definition)
      const carriedProgress = carried && carried.quest_id === definition.id
        ? Math.min(carried.progress, variant.target)
        : 0

      held.add(definition.id)
      pending.push([
        accountId,
        cadence,
        slotIndex,
        definition.id,
        variant.target,
        variant.shards,
        carriedProgress,
        0,
        periodKey,
        expiresAt,
      ])
    }
  }

  if (pending.length === 0) return
  const assign = db.transaction(() => {
    for (const args of pending) _assignQuestSlot.run(...args)
    _deleteLegacyRotatingQuests.run(accountId)
  })
  assign()
}

/**
 * Make sure every chain has a row, and credit players who already finished the
 * one-shot quests chains replaced.
 *
 * The legacy credit runs only when an account has no chain rows at all, so it
 * happens exactly once per player rather than on every request.
 */
function ensureQuestChains(accountId) {
  const firstRun = _listQuestChains.all(accountId).length === 0

  const seed = db.transaction(() => {
    for (const chain of QUEST_CHAINS) _insertQuestChain.run(accountId, chain.id)
    if (!firstRun) return

    for (const { questId, chainId } of legacyChainMigrations()) {
      const legacy = _getLegacyPermanentQuest.get(accountId, questId)
      if (!legacy?.claimed) continue
      _seedQuestChain.run(getQuestChain(chainId).tiers[0].target, 1, accountId, chainId)
    }
  })
  seed()
}

const PACK_TIER_ORDER = ['basic', 'premium', 'legendary']

function packTierMeets(actual, required) {
  const actualIndex = PACK_TIER_ORDER.indexOf(actual)
  const requiredIndex = PACK_TIER_ORDER.indexOf(required)
  return actualIndex !== -1 && requiredIndex !== -1 && actualIndex >= requiredIndex
}

function questMatchesEvent(quest, eventType, payload) {
  const objective = quest.objective
  if (objective.type !== eventType) return false
  if (objective.type === 'win_ai_difficulty') {
    return difficultyMeets(payload.aiDifficulty, objective.difficulty)
  }
  if (objective.type === 'open_pack_type') {
    return packTierMeets(payload.packTier, objective.packTier)
  }
  return true
}

/**
 * How much an event moves an objective.
 *
 * Counting objectives accumulate; "reach a streak of N" objectives keep the
 * best single value seen, because a streak that breaks should not erase the
 * peak the player already hit.
 */
function nextQuestProgress(entry, event) {
  const amount = Math.max(1, Number(event.amount ?? 1))
  const cap = (value) => (entry.uncapped ? value : Math.min(entry.target, value))
  if (entry.definition.objective.mode === 'high_water') {
    return cap(Math.max(entry.progress, amount))
  }
  return cap(entry.progress + amount)
}

// Slot rows and permanent rows differ in storage but not in how progress
// advances, so events are applied against one normalized list and flushed back
// to whichever table each entry came from.
function collectQuestEntries(accountId) {
  const entries = []

  for (const row of _listQuestSlots.all(accountId)) {
    const definition = getQuestDefinition(row.quest_id)
    if (!definition) continue
    entries.push({
      kind: 'slot',
      definition,
      cadence: row.cadence,
      slotIndex: row.slot_index,
      target: row.target,
      rewardShards: row.reward_shards,
      progress: row.progress,
      claimed: Boolean(row.claimed),
      completedAt: row.completed_at,
      expiresAt: row.expires_at,
      periodKey: row.assigned_key,
      rerolled: Boolean(row.rerolled),
    })
  }

  for (const row of _listQuestChains.all(accountId)) {
    const chain = getQuestChain(row.chain_id)
    if (!chain) continue

    const exhausted = isChainExhausted(chain, row.claimed_tier)
    // An exhausted chain has no next tier; pin it to its final one so the
    // ledger can still render a finished ladder.
    const tier = chainTier(chain, exhausted ? chain.tiers.length - 1 : row.claimed_tier)

    entries.push({
      kind: 'chain',
      definition: chain,
      cadence: chain.cadence,
      slotIndex: null,
      tierIndex: row.claimed_tier,
      target: tier.target,
      rewardShards: tier.shards,
      progress: row.progress,
      // A chain is never "claimed" while tiers remain; only a finite chain that
      // has run out reads as done.
      claimed: exhausted,
      exhausted,
      completedAt: null,
      expiresAt: null,
      periodKey: 'ever',
      rerolled: false,
      // Lifetime totals must not be clamped to the current tier, or a batch
      // that overshoots would silently lose the excess.
      uncapped: true,
    })
  }

  return entries
}

function flushQuestEntries(accountId, entries) {
  const dirty = entries.filter((entry) => entry.dirty)
  if (dirty.length === 0) return
  const write = db.transaction(() => {
    for (const entry of dirty) {
      if (entry.kind === 'slot') {
        _setQuestSlotProgress.run(entry.progress, entry.completedAt, accountId, entry.cadence, entry.slotIndex)
      } else {
        _setQuestChainProgress.run(entry.progress, accountId, entry.definition.id)
      }
    }
  })
  write()
}

/**
 * Apply a batch of quest events in one pass.
 *
 * A single AI win fires four events. Applying them one at a time meant four
 * ensure-rows passes and four full table scans per match; batching collapses
 * that to one read and one write transaction.
 */
export function recordQuestEvents(accountId, events) {
  if (!accountId) return { ok: false, error: 'Missing account.' }
  const batch = (Array.isArray(events) ? events : [events]).filter(Boolean)
  if (batch.length === 0) return { ok: true, completed: [] }

  ensureQuestSlots(accountId)
  ensureQuestChains(accountId)

  const entries = collectQuestEntries(accountId)
  const nowIso = new Date().toISOString()
  const completed = []

  for (const event of batch) {
    const eventType = String(event.type ?? '')
    for (const entry of entries) {
      if (entry.claimed) continue
      if (entry.expiresAt && entry.expiresAt <= nowIso) continue
      // Chains keep counting past the current tier — the excess rolls into the
      // next one. Only capped quests stop at their target.
      if (!entry.uncapped && entry.progress >= entry.target) continue
      if (!questMatchesEvent(entry.definition, eventType, event)) continue

      const next = nextQuestProgress(entry, event)
      if (next === entry.progress) continue

      const wasComplete = entry.progress >= entry.target
      entry.progress = next
      entry.dirty = true
      if (!wasComplete && entry.progress >= entry.target) {
        if (!entry.uncapped) entry.completedAt = nowIso
        completed.push({
          id: entry.definition.id,
          title: entry.definition.title,
          cadence: entry.cadence,
          shards: entry.rewardShards,
        })
      }
    }
  }

  flushQuestEntries(accountId, entries)
  return { ok: true, completed }
}

export function recordQuestEvent(accountId, eventType, payload = {}) {
  return recordQuestEvents(accountId, [{ ...payload, type: eventType }])
}

// A settled match feeds several objectives at once. Building the list up front
// keeps both settlement paths to a single batched write.
function buildMatchQuestEvents(mode, result, aiDifficulty, streak = 0) {
  const events = [{ type: 'play_matches' }]
  if (result !== 'win') return events

  events.push({ type: 'win_any_match' })
  // Reported as the streak's current height, not an increment — `reach_streak`
  // is a high-water objective.
  if (streak > 0) events.push({ type: 'reach_streak', amount: streak })
  if (mode === 'ai') {
    events.push({ type: 'win_ai' }, { type: 'win_ai_difficulty', aiDifficulty })
  }
  return events
}

function buildQuestSummary(quests) {
  return {
    total: quests.length,
    completed: quests.filter((quest) => quest.completed).length,
    claimable: quests.filter((quest) => quest.completed && !quest.claimed).length,
    claimed: quests.filter((quest) => quest.claimed).length,
    dailyClaimable: quests.filter((quest) => quest.cadence === 'daily' && quest.completed && !quest.claimed).length,
    weeklyClaimable: quests.filter((quest) => quest.cadence === 'weekly' && quest.completed && !quest.claimed).length,
    milestoneClaimable: quests.filter((quest) => quest.cadence === 'milestone' && quest.completed && !quest.claimed).length,
    skirmishClaimable: quests.filter((quest) => quest.cadence === 'skirmish' && quest.completed && !quest.claimed).length,
  }
}

// Cadence order drives the ledger tabs, so keep it stable regardless of the
// order rows come back from SQLite in.
const QUEST_CADENCE_ORDER = ['daily', 'weekly', 'milestone', 'skirmish']

function compareQuests(left, right) {
  const cadenceDelta = QUEST_CADENCE_ORDER.indexOf(left.cadence) - QUEST_CADENCE_ORDER.indexOf(right.cadence)
  if (cadenceDelta !== 0) return cadenceDelta
  if (left.slotIndex !== null && right.slotIndex !== null) return left.slotIndex - right.slotIndex
  return left.id.localeCompare(right.id)
}

export function getQuestOverview(accountId) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  ensureQuestSlots(accountId)
  ensureQuestChains(accountId)

  const entries = collectQuestEntries(accountId)

  // Some objectives read live account state rather than counting events, so
  // they are reconciled on read instead of being advanced by recordQuestEvents.
  const nowIso = new Date().toISOString()
  for (const entry of entries) {
    if (entry.claimed) continue
    const derived = derivedQuestProgress(entry.definition.objective.type, profile)
    if (derived === null) continue

    const next = entry.uncapped
      ? Math.max(entry.progress, derived)
      : Math.min(entry.target, Math.max(entry.progress, derived))
    if (next === entry.progress) continue

    entry.progress = next
    entry.dirty = true
    if (!entry.uncapped && next >= entry.target && !entry.completedAt) entry.completedAt = nowIso
  }
  flushQuestEntries(accountId, entries)

  const quests = entries.map(hydrateQuestEntry).sort(compareQuests)

  return {
    ok: true,
    quests,
    // The richer ladder view. `quests` still carries each chain's current tier
    // in quest shape so anything rendering a flat list keeps working.
    chains: entries.filter((entry) => entry.kind === 'chain').map(hydrateChainEntry),
    summary: buildQuestSummary(quests),
    rerolls: {
      daily: profile.quest_reroll_daily_key !== dayKey(),
      weekly: profile.quest_reroll_weekly_key !== dayKey(),
    },
  }
}

/**
 * Flatten an entry into the quest shape the ledger renders.
 *
 * A chain surfaces as its current tier — "Riftbreaker III", 12/25 — so the
 * permanent tabs always show a live objective instead of a wall of finished
 * one-shots.
 */
function hydrateQuestEntry(entry) {
  const { variants: _variants, tiers: _tiers, endless: _endless, legacyQuestIds: _legacy, ...definition } = entry.definition
  const isChain = entry.kind === 'chain'
  const tierLabel = isChain ? chainTierLabel(Math.min(entry.tierIndex, entry.definition.tiers.length - 1)) : null

  return {
    ...definition,
    title: isChain ? `${definition.title} ${tierLabel}` : definition.title,
    // Target and payout come from the rolled variant (or current tier) on the
    // row, not the definition, so a "win 3" assignment never renders as "win 2".
    description: renderQuestDescription(definition, entry.target),
    reward: { shards: entry.rewardShards },
    progress: Math.min(entry.progress, entry.target),
    target: entry.target,
    completed: entry.progress >= entry.target,
    claimed: entry.claimed,
    periodKey: entry.periodKey,
    expiresAt: entry.expiresAt,
    slotIndex: entry.slotIndex,
    rerolled: entry.rerolled,
    tierIndex: isChain ? entry.tierIndex : null,
    tierLabel,
  }
}

function hydrateChainEntry(entry) {
  const chain = entry.definition
  return {
    id: chain.id,
    cadence: chain.cadence,
    title: chain.title,
    category: chain.category,
    icon: chain.icon,
    tierIndex: entry.tierIndex,
    tierLabel: chainTierLabel(Math.min(entry.tierIndex, chain.tiers.length - 1)),
    progress: entry.progress,
    target: entry.target,
    reward: { shards: entry.rewardShards },
    description: renderQuestDescription(chain, entry.target),
    completed: entry.progress >= entry.target,
    exhausted: entry.exhausted,
    endless: Boolean(chain.endless),
    // The full ladder, so the UI can show where this tier sits and what is next.
    ladder: chain.tiers.map((tier, index) => ({
      label: chainTierLabel(index),
      target: tier.target,
      shards: tier.shards,
      claimed: index < entry.tierIndex,
    })),
  }
}

/**
 * Claim one or many quest rewards inside a single transaction.
 *
 * Claiming used to be one request per quest, which meant the "Claim Ready
 * Rewards" button fired N parallel POSTs that each returned an absolute shard
 * balance — so an out-of-order response could leave a stale total on screen,
 * and each response stomped the previous reward cinema. One call, one balance,
 * one cinema.
 *
 * Passing no ids claims everything currently ready.
 */
export function claimQuestRewards(accountId, questIds = null) {
  const overview = getQuestOverview(accountId)
  if (!overview.ok) return overview

  const explicit = Array.isArray(questIds) && questIds.length > 0
  const requested = explicit
    ? questIds.map((id) => overview.quests.find((quest) => quest.id === id) ?? { id, missing: true })
    : overview.quests.filter((quest) => quest.completed && !quest.claimed)

  const claimable = []
  const rejected = []
  for (const quest of requested) {
    if (quest.missing) rejected.push({ id: quest.id, error: 'Quest is not active.' })
    else if (!quest.completed) rejected.push({ id: quest.id, error: 'Quest is not complete yet.' })
    else if (quest.claimed) rejected.push({ id: quest.id, error: 'Quest reward already claimed.' })
    else claimable.push(quest)
  }

  const claims = []
  if (claimable.length > 0) {
    const tx = db.transaction(() => {
      for (const quest of claimable) {
        // Claiming a chain tier advances the ladder instead of retiring the
        // row, so the next objective is live the moment this one is collected.
        const changes = quest.slotIndex === null
          ? _claimQuestChainTier.run(accountId, quest.id, quest.tierIndex).changes
          : _claimQuestSlot.run(accountId, quest.cadence, quest.slotIndex).changes
        if (changes !== 1) {
          rejected.push({ id: quest.id, error: 'Quest reward already claimed.' })
          continue
        }
        _grantShards.run(quest.reward.shards, quest.reward.shards, accountId)
        claims.push({ quest: { ...quest, claimed: true }, reward: quest.reward })
      }
    })
    tx()
  }

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    claims,
    rejected,
    totalShards: claims.reduce((sum, entry) => sum + entry.reward.shards, 0),
    shards: refreshed.shards,
    totalEarned: refreshed.total_earned,
    overview: getQuestOverview(accountId),
  }
}

export function claimQuestReward(accountId, questId) {
  const result = claimQuestRewards(accountId, [String(questId ?? '')])
  if (!result.ok) return result

  const claim = result.claims[0]
  if (!claim) return { ok: false, error: result.rejected[0]?.error ?? 'Quest is not active.' }

  return {
    ok: true,
    quest: claim.quest,
    reward: claim.reward,
    shards: result.shards,
    totalEarned: result.totalEarned,
    overview: result.overview,
  }
}

/**
 * Swap one rotating quest for a different objective in the same tier.
 *
 * One free reroll per cadence per day, refreshing at the daily reset — the
 * weekly reroll refreshes daily too, so a bad weekly is never a week-long
 * sentence. Progress does not carry across a reroll, and a completed quest
 * must be claimed rather than rerolled so the reward cannot be discarded by
 * accident.
 */
export function rerollQuest(accountId, questId) {
  const overview = getQuestOverview(accountId)
  if (!overview.ok) return overview

  const quest = overview.quests.find((entry) => entry.id === questId)
  if (!quest) return { ok: false, error: 'Quest is not active.' }
  if (quest.slotIndex === null) return { ok: false, error: 'Only daily and weekly quests can be rerolled.' }
  if (quest.claimed) return { ok: false, error: 'Quest reward already claimed.' }
  if (quest.completed) return { ok: false, error: 'This quest is ready to claim. Collect it instead of rerolling.' }

  const held = new Set(
    overview.quests
      .filter((entry) => entry.cadence === quest.cadence && entry.slotIndex !== null)
      .map((entry) => entry.id),
  )
  const replacement = pickSlotQuest(quest.cadence, tierForSlot(quest.slotIndex), held)
  if (!replacement) return { ok: false, error: 'No replacement quest is available.' }

  const todayKey = dayKey()
  const spendReroll = quest.cadence === 'daily' ? _spendDailyReroll : _spendWeeklyReroll
  const variant = rollVariant(replacement)

  const tx = db.transaction(() => {
    if (spendReroll.run(todayKey, accountId, todayKey).changes !== 1) return false
    _assignQuestSlot.run(
      accountId,
      quest.cadence,
      quest.slotIndex,
      replacement.id,
      variant.target,
      variant.shards,
      0,
      1,
      questPeriodKey(quest.cadence),
      questExpiresAt(quest.cadence),
    )
    return true
  })

  if (!tx()) {
    return { ok: false, error: `Free ${quest.cadence} reroll already used. It refreshes at the next daily reset.` }
  }

  const refreshed = getQuestOverview(accountId)
  return {
    ok: true,
    replaced: quest.id,
    quest: refreshed.quests.find((entry) => entry.cadence === quest.cadence && entry.slotIndex === quest.slotIndex),
    overview: refreshed,
  }
}

export function claimDailyReward(accountId) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  const todayKey = new Date().toISOString().slice(0, 10)
  if (profile.last_daily === todayKey) {
    return { ok: false, error: 'Daily reward already claimed today.' }
  }

  const claimed = _setDailyClaim.run(todayKey, DAILY_SHARDS, DAILY_SHARDS, accountId, todayKey)
  if (claimed.changes !== 1) {
    return { ok: false, error: 'Daily reward already claimed today.' }
  }
  recordQuestEvent(accountId, 'claim_daily')
  const refreshed = getProfile(accountId)
  return {
    ok: true,
    amount: DAILY_SHARDS,
    newBalance: refreshed.shards,
    shards: refreshed.shards,
    totalEarned: refreshed.total_earned,
  }
}

export function purchaseTheme(accountId, themeId) {
  const cost = THEME_COSTS[themeId]
  if (cost === undefined) return { ok: false, error: 'Unknown theme.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  if (profile.owned_themes.includes(themeId)) {
    return { ok: false, error: 'Theme already owned.' }
  }

  if (cost > 0 && profile.shards < cost) {
    return { ok: false, error: 'Not enough Shards.' }
  }

  const tx = db.transaction(() => {
    if (cost > 0) {
      if (_deductShards.run(cost, accountId, cost).changes !== 1) return false
    }
    const updated = [...profile.owned_themes, themeId]
    _addOwnedTheme.run(JSON.stringify(updated), accountId)
    _updateTheme.run(themeId, accountId)
    return true
  })

  if (!tx()) return { ok: false, error: 'Not enough Shards.' }
  if (cost > 0) recordQuestEvent(accountId, 'spend_shards', { amount: cost })
  const refreshed = getProfile(accountId)
  return { ok: true, shards: refreshed.shards, ownedThemes: refreshed.owned_themes }
}

// ─── Card border cosmetic system ─────────────────────────────────────
//
// Borders are pure-cosmetic frames applied to every rendered card in
// the deck builder, vault, and battlefield. Pricing is server-side so
// the catalog cannot be tampered with from the client.

// Mirrors CARD_BORDER_OFFERS in src/constants.ts — this copy is the authority
// for cost, the client copy only for display. Ids are what `owned_card_borders`
// stores, so they never change; names and descriptions may.
const CARD_BORDER_CATALOG = [
  { id: 'default', name: 'Standard Frame',  cost: 0,   description: 'The plain bezel, tinted by the card’s own rarity.' },
  { id: 'bronze',  name: 'Bronze Filigree', cost: 90,  description: 'Hammered bronze bezel ringed with fine beadwork.' },
  { id: 'frost',   name: 'Frost Etching',   cost: 180, description: 'Pale silver bezel scored with etched frost lines.' },
  { id: 'solar',   name: 'Solar Ember',     cost: 280, description: 'Dark copper bezel with an ember that breathes across the card.' },
  { id: 'void',    name: 'Voidweave',       cost: 420, description: 'Obsidian bezel swept by a travelling violet sheen.' },
]

export function listCardBorders() {
  return CARD_BORDER_CATALOG.map((entry) => ({ ...entry }))
}

const _setCardBorder = prepare(`
  UPDATE player_profiles
  SET selected_card_border = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)
const _setOwnedCardBorders = prepare(`
  UPDATE player_profiles
  SET owned_card_borders = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)

export function purchaseCardBorder(accountId, borderId) {
  const entry = CARD_BORDER_CATALOG.find((b) => b.id === borderId)
  if (!entry) return { ok: false, error: 'Unknown card border.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  if (profile.owned_card_borders.includes(borderId)) {
    return { ok: false, error: 'Card border already owned.' }
  }

  if (entry.cost > 0 && profile.shards < entry.cost) {
    return { ok: false, error: 'Not enough Shards.' }
  }

  const tx = db.transaction(() => {
    if (entry.cost > 0) {
      if (_deductShards.run(entry.cost, accountId, entry.cost).changes !== 1) return false
    }
    const updated = [...profile.owned_card_borders, borderId]
    _setOwnedCardBorders.run(JSON.stringify(updated), accountId)
    _setCardBorder.run(borderId, accountId)
    return true
  })
  if (!tx()) return { ok: false, error: 'Not enough Shards.' }
  if (entry.cost > 0) recordQuestEvent(accountId, 'spend_shards', { amount: entry.cost })

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    shards: refreshed.shards,
    ownedCardBorders: refreshed.owned_card_borders,
    selectedCardBorder: refreshed.selected_card_border,
  }
}

export function selectCardBorder(accountId, borderId) {
  const entry = CARD_BORDER_CATALOG.find((b) => b.id === borderId)
  if (!entry) return { ok: false, error: 'Unknown card border.' }
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }
  if (!profile.owned_card_borders.includes(borderId)) {
    return { ok: false, error: 'Card border not owned.' }
  }
  _setCardBorder.run(borderId, accountId)
  return { ok: true, selectedCardBorder: borderId }
}

// ─── Shard breakdown (excess copies → currency) ─────────────────────
//
// Refund value is the same per-rarity table used to compensate dupes
// from packs, so breaking down a copy yields exactly what opening a
// duplicate of the same rarity would have refunded. Players can never
// reduce a card below the maximum copy count required by any of their
// saved decks (so an active deck never breaks).

const RARITY_BREAKDOWN_VALUE = { common: 5, rare: 10, epic: 25, legendary: 100 }

function deckCopiesIncluding(decks, cardId) {
  let max = 0
  for (const deck of decks) {
    const n = deck.deckConfig?.[cardId] ?? 0
    if (n > max) max = n
  }
  return max
}

export function breakdownCard(accountId, cardId, qty) {
  if (typeof cardId !== 'string' || !DECK_CARD_ID_RE.test(cardId)) {
    return { ok: false, error: 'Invalid card identifier.' }
  }
  const requested = Number(qty)
  if (!Number.isInteger(requested) || requested < 1 || requested > 10) {
    return { ok: false, error: 'Quantity must be an integer between 1 and 10.' }
  }
  const cardMeta = CARD_LIBRARY.find((c) => c.id === cardId)
  if (!cardMeta) return { ok: false, error: 'Unknown card.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  const owned = profile.owned_cards?.[cardId] ?? 0
  if (owned <= 0) return { ok: false, error: 'You do not own that card.' }

  const decks = listDecks(accountId)
  const deckMin = deckCopiesIncluding(decks, cardId)
  const breakable = owned - deckMin
  if (breakable <= 0) {
    return { ok: false, error: 'All copies of that card are needed by one of your saved decks.' }
  }
  if (requested > breakable) {
    return { ok: false, error: `You can only break down ${breakable} extra copy/copies of that card.` }
  }

  const refundPer = RARITY_BREAKDOWN_VALUE[cardMeta.rarity] ?? 5
  const totalRefund = refundPer * requested

  const updatedOwned = { ...profile.owned_cards }
  const newCount = owned - requested
  if (newCount > 0) {
    updatedOwned[cardId] = newCount
  } else {
    delete updatedOwned[cardId]
  }

  const tx = db.transaction(() => {
    _setOwnedCards.run(JSON.stringify(updatedOwned), accountId)
    _grantShards.run(totalRefund, totalRefund, accountId)
  })
  tx()
  recordQuestEvent(accountId, 'breakdown_cards', { amount: requested })

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    cardId,
    refunded: totalRefund,
    refundPer,
    qty: requested,
    shards: refreshed.shards,
    owned: refreshed.owned_cards,
  }
}

const _insertAuthoritativeMatch = prepare(`
  INSERT INTO authoritative_matches (match_id, mode, reason, turns, metadata)
  VALUES (?, ?, ?, ?, ?)
`)
const _getAuthoritativeMatch = prepare(`
  SELECT * FROM authoritative_matches WHERE match_id = ?
`)
const _insertAuthoritativeParticipant = prepare(`
  INSERT INTO authoritative_match_participants (
    match_id, account_id, opponent_account_id, opponent_name, result,
    shards_earned, rating_delta, streak_after, balance_after, rating_after,
    wins_after, losses_after, match_log_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const _listAuthoritativeParticipants = prepare(`
  SELECT * FROM authoritative_match_participants
  WHERE match_id = ? ORDER BY account_id ASC
`)
const _getAuthoritativeParticipantForAccount = prepare(`
  SELECT p.*, m.mode, m.reason, m.turns, m.metadata, m.settled_at
  FROM authoritative_match_participants p
  JOIN authoritative_matches m ON m.match_id = p.match_id
  WHERE p.match_id = ? AND p.account_id = ?
`)
const _getLatestAuthoritativeParticipant = prepare(`
  SELECT p.*, m.mode, m.reason, m.turns, m.metadata, m.settled_at
  FROM authoritative_match_participants p
  JOIN authoritative_matches m ON m.match_id = p.match_id
  WHERE p.account_id = ? AND p.acknowledged_at IS NULL
  ORDER BY m.settled_at DESC, m.rowid DESC
  LIMIT 1
`)
const _acknowledgeAuthoritativeParticipant = prepare(`
  UPDATE authoritative_match_participants
  SET acknowledged_at = COALESCE(acknowledged_at, datetime('now'))
  WHERE match_id = ? AND account_id = ?
`)
const _insertEconomyLedger = prepare(`
  INSERT INTO economy_ledger (
    id, account_id, idempotency_key, source, amount, balance_after, match_id, metadata
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

function parseStoredMetadata(rawValue) {
  try {
    const parsed = JSON.parse(rawValue ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function mapStoredOutcome(row) {
  return {
    accountId: row.account_id,
    opponentAccountId: row.opponent_account_id,
    opponent: row.opponent_name,
    result: row.result,
    shardsEarned: row.shards_earned,
    ratingDelta: row.rating_delta,
    streak: row.streak_after,
    shards: row.balance_after,
    seasonRating: row.rating_after,
    wins: row.wins_after,
    losses: row.losses_after,
    matchLogId: row.match_log_id,
  }
}

function hydrateAuthoritativeMatch(matchId) {
  const match = _getAuthoritativeMatch.get(matchId)
  if (!match) return null
  const outcomes = _listAuthoritativeParticipants.all(matchId).map(mapStoredOutcome)
  return {
    ok: true,
    matchId: match.match_id,
    mode: match.mode,
    reason: match.reason,
    turns: match.turns,
    metadata: parseStoredMetadata(match.metadata),
    settledAt: match.settled_at,
    outcomes,
  }
}

function hydrateAuthoritativeMatchForAccount(row) {
  if (!row) return null
  return {
    ok: true,
    matchId: row.match_id,
    mode: row.mode,
    reason: row.reason,
    turns: row.turns,
    metadata: parseStoredMetadata(row.metadata),
    settledAt: row.settled_at,
    outcome: mapStoredOutcome(row),
  }
}

function normalizeAuthoritativeSettlement(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Settlement payload must be an object.' }
  }
  const matchId = String(input.matchId ?? '').trim()
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(matchId)) {
    return { ok: false, error: 'Invalid authoritative match identifier.' }
  }
  const mode = String(input.mode ?? '')
  if (!['ai', 'duel', 'unranked'].includes(mode)) {
    return { ok: false, error: 'Authoritative match mode must be ai, duel, or unranked.' }
  }
  const reason = String(input.reason ?? 'completed').trim()
  if (!/^[a-z0-9_-]{1,40}$/.test(reason)) {
    return { ok: false, error: 'Invalid match completion reason.' }
  }
  const turns = Number(input.turns ?? 0)
  if (!Number.isInteger(turns) || turns < 0 || turns > 1000) {
    return { ok: false, error: 'Match turns must be an integer between 0 and 1000.' }
  }
  const expectedParticipants = mode === 'ai' ? 1 : 2
  if (!Array.isArray(input.participants) || input.participants.length !== expectedParticipants) {
    return { ok: false, error: `Authoritative ${mode} matches require exactly ${expectedParticipants} participant(s).` }
  }

  const participants = input.participants.map((entry) => ({
    accountId: String(entry?.accountId ?? '').trim(),
    name: String(entry?.name ?? entry?.displayName ?? '').trim().slice(0, 40),
    opponentName: String(entry?.opponentName ?? entry?.opponent ?? '').trim().slice(0, 40),
    result: String(entry?.result ?? ''),
  }))
  if (participants.some((entry) => !entry.accountId)) {
    return { ok: false, error: 'Every participant requires an account identifier.' }
  }
  if (participants.length === 2 && participants[0].accountId === participants[1].accountId) {
    return { ok: false, error: 'Authoritative match participants must be distinct accounts.' }
  }
  if (participants.some((entry) => !['win', 'loss', 'draw'].includes(entry.result))) {
    return { ok: false, error: 'Invalid authoritative match result.' }
  }
  const results = participants.map((entry) => entry.result).sort().join(':')
  if (participants.length === 2 && results !== 'draw:draw' && results !== 'loss:win') {
    return { ok: false, error: 'Authoritative participant results are inconsistent.' }
  }

  const metadata = input.metadata ?? {}
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { ok: false, error: 'Match metadata must be an object.' }
  }
  if (mode === 'ai' && !['novice', 'adept', 'veteran', 'legend'].includes(String(metadata.aiDifficulty ?? ''))) {
    return { ok: false, error: 'Authoritative AI matches require a valid AI difficulty.' }
  }
  let metadataJson
  try {
    metadataJson = JSON.stringify(metadata)
  } catch {
    return { ok: false, error: 'Match metadata must be JSON serializable.' }
  }
  if (metadataJson.length > 16_384) {
    return { ok: false, error: 'Match metadata is too large.' }
  }

  if (participants.length === 2) {
    participants[0].opponentAccountId = participants[1].accountId
    participants[1].opponentAccountId = participants[0].accountId
    participants[0].opponentName ||= participants[1].name || 'Opponent'
    participants[1].opponentName ||= participants[0].name || 'Opponent'
  } else {
    participants[0].opponentAccountId = null
    participants[0].opponentName ||= String(metadata.opponentName ?? 'AI Opponent').slice(0, 40)
  }
  return { ok: true, matchId, mode, reason, turns, participants, metadata, metadataJson }
}

const _settleAuthoritativeMatch = transaction((settlement) => {
  const existing = hydrateAuthoritativeMatch(settlement.matchId)
  if (existing) return { settlement: existing, replayed: true }

  const profiles = settlement.participants.map((participant) => _getProfile.get(participant.accountId))
  const missingIndex = profiles.findIndex((profile) => !profile)
  if (missingIndex !== -1) {
    return { error: `Profile not found for participant ${settlement.participants[missingIndex].accountId}.` }
  }

  const calculated = settlement.participants.map((participant, index) => ({
    participant,
    profile: profiles[index],
    ...calculateAuthoritativeMatchEconomy(
      profiles[index],
      settlement.mode,
      participant.result,
      settlement.reason,
      settlement.turns,
    ),
  }))

  _insertAuthoritativeMatch.run(
    settlement.matchId,
    settlement.mode,
    settlement.reason,
    settlement.turns,
    settlement.metadataJson,
  )

  for (const entry of calculated) {
    const { participant, profile, shardsEarned, ratingDelta, newStreak, questEligible, rewardEligible, recordEligible } = entry
    const matchLogId = `${settlement.matchId}:${participant.accountId}`
    if (_grantShards.run(shardsEarned, shardsEarned, participant.accountId).changes !== 1) {
      throw new Error(`Failed to grant match reward to ${participant.accountId}.`)
    }
    if (_updateRating.run(RATING_FLOOR, ratingDelta, participant.accountId).changes !== 1) {
      throw new Error(`Failed to update rating for ${participant.accountId}.`)
    }
    if (recordEligible) {
      if (_updateRecord.run(
        participant.result === 'win' ? 1 : 0,
        participant.result === 'loss' ? 1 : 0,
        newStreak,
        participant.accountId,
      ).changes !== 1) {
        throw new Error(`Failed to update match record for ${participant.accountId}.`)
      }
    }
    _insertMatch.run(
      matchLogId,
      participant.accountId,
      participant.opponentName,
      settlement.mode,
      participant.result,
      settlement.turns,
      shardsEarned,
      ratingDelta,
    )

    const refreshed = _getProfile.get(participant.accountId)
    _insertAuthoritativeParticipant.run(
      settlement.matchId,
      participant.accountId,
      participant.opponentAccountId,
      participant.opponentName,
      participant.result,
      shardsEarned,
      ratingDelta,
      refreshed.streak,
      refreshed.shards,
      refreshed.season_rating,
      refreshed.wins,
      refreshed.losses,
      matchLogId,
    )
    const ledgerId = `match:${settlement.matchId}:${participant.accountId}`
    _insertEconomyLedger.run(
      ledgerId,
      participant.accountId,
      ledgerId,
      'authoritative_match',
      shardsEarned,
      refreshed.shards,
      settlement.matchId,
      JSON.stringify({
        mode: settlement.mode,
        reason: settlement.reason,
        result: participant.result,
        ratingDelta,
        previousRating: profile.season_rating,
        rewardEligible,
      }),
    )

    if (questEligible) {
      recordQuestEvents(participant.accountId, buildMatchQuestEvents(
        settlement.mode,
        participant.result,
        settlement.metadata.aiDifficulty,
        refreshed.streak,
      ))
    }
  }

  return { settlement: hydrateAuthoritativeMatch(settlement.matchId), replayed: false }
})

export function settleAuthoritativeMatch(input) {
  const matchId = String(input?.matchId ?? '').trim()
  if (/^[A-Za-z0-9._:-]{1,128}$/.test(matchId)) {
    const existing = hydrateAuthoritativeMatch(matchId)
    if (existing) return { ...existing, replayed: true }
  }

  const normalized = normalizeAuthoritativeSettlement(input)
  if (!normalized.ok) return normalized
  try {
    const result = _settleAuthoritativeMatch(normalized)
    if (result.error) return { ok: false, error: result.error }
    return { ...result.settlement, replayed: result.replayed }
  } catch (error) {
    if (error?.code?.startsWith('SQLITE_CONSTRAINT')) {
      const existing = hydrateAuthoritativeMatch(normalized.matchId)
      if (existing) return { ...existing, replayed: true }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Could not settle authoritative match.' }
  }
}

export function getMatchSettlementForAccount(matchId, accountId) {
  return hydrateAuthoritativeMatchForAccount(
    _getAuthoritativeParticipantForAccount.get(String(matchId ?? ''), String(accountId ?? '')),
  )
}

export function getLatestUnacknowledgedSettlement(accountId) {
  return hydrateAuthoritativeMatchForAccount(
    _getLatestAuthoritativeParticipant.get(String(accountId ?? '')),
  )
}

export function acknowledgeMatchSettlement(matchId, accountId) {
  return _acknowledgeAuthoritativeParticipant.run(String(matchId ?? ''), String(accountId ?? '')).changes === 1
}

export function resolveMatchResult(accountId, opponent, mode, result, turns, metadata = {}) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  const { shardsEarned, ratingDelta, newStreak } = calculateMatchEconomy(profile, mode, result)

  const matchId = `m-${randomBytes(8).toString('hex')}`

  const tx = db.transaction(() => {
    _grantShards.run(shardsEarned, shardsEarned, accountId)
    _updateRating.run(RATING_FLOOR, ratingDelta, accountId)
    _updateRecord.run(
      result === 'win' ? 1 : 0,
      result === 'loss' ? 1 : 0,
      newStreak,
      accountId,
    )
    _insertMatch.run(matchId, accountId, opponent, mode, result, turns, shardsEarned, ratingDelta)
  })

  tx()
  recordQuestEvents(accountId, buildMatchQuestEvents(mode, result, metadata.aiDifficulty ?? 'adept', newStreak))
  const refreshed = getProfile(accountId)
  return {
    ok: true,
    matchId,
    shardsEarned,
    ratingDelta,
    streak: refreshed.streak,
    shards: refreshed.shards,
    seasonRating: refreshed.season_rating,
    wins: refreshed.wins,
    losses: refreshed.losses,
  }
}

// ─── Card Pack System ────────────────────────────────────────────────────────

const CARD_POOL = {
  common: CARD_LIBRARY.filter((card) => card.rarity === 'common').map((card) => card.id),
  rare: CARD_LIBRARY.filter((card) => card.rarity === 'rare').map((card) => card.id),
  epic: CARD_LIBRARY.filter((card) => card.rarity === 'epic').map((card) => card.id),
  legendary: CARD_LIBRARY.filter((card) => card.rarity === 'legendary').map((card) => card.id),
}

const ALL_CARDS = CARD_LIBRARY.map((card) => card.id)

const PACK_DEFS = {
  basic:     { cost: 50,  slots: [ { rarity: 'common' }, { rarity: 'common' }, { rarity: 'common' }, { rarity: 'rare' } ] },
  premium:   { cost: 150, slots: [ { rarity: 'common' }, { rarity: 'common' }, { rarity: 'common' }, { rarity: 'rare' }, { rarity: 'epic' } ] },
  legendary: { cost: 400, slots: [ { rarity: 'common' }, { rarity: 'rare' }, { rarity: 'epic' }, { rarity: 'rare' }, { rarity: 'legendary' } ] },
}

const RARITY_WEIGHTS = [
  { rarity: 'legendary', weight: 0.02 },
  { rarity: 'epic',      weight: 0.08 },
  { rarity: 'rare',      weight: 0.20 },
  { rarity: 'common',    weight: 0.70 },
]

function rollRandomRarity() {
  const r = Math.random()
  let acc = 0
  for (const { rarity, weight } of RARITY_WEIGHTS) {
    acc += weight
    if (r < acc) return rarity
  }
  return 'common'
}

function pickCard(rarity) {
  const pool = CARD_POOL[rarity]
  return pool[Math.floor(Math.random() * pool.length)]
}

export const _getOwnedCards = prepare(`SELECT owned_cards FROM player_profiles WHERE account_id = ?`)

export const _setOwnedCards = prepare(`
  UPDATE player_profiles SET owned_cards = ?, updated_at = datetime('now') WHERE account_id = ?
`)

export function getCollection(accountId) {
  const row = _getOwnedCards.get(accountId)
  if (!row) return null
  const owned = normalizeOwnedCards(row.owned_cards)
  if (!row.owned_cards || row.owned_cards === '{}' || row.owned_cards === 'null') {
    _setOwnedCards.run(JSON.stringify(owned), accountId)
  }
  return owned
}

export function openPack(accountId, packType) {
  const packDef = PACK_DEFS[packType]
  if (!packDef) return { ok: false, error: 'Unknown pack type.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }
  if (profile.shards < packDef.cost) return { ok: false, error: 'Not enough Shards.' }

  const ownedRow = _getOwnedCards.get(accountId)
  const owned = ownedRow ? normalizeOwnedCards(ownedRow.owned_cards) : buildStarterCollection()

  // Prefer any card in the rolled rarity that is still below its copy cap.
  // Only a fully collected rarity can roll a duplicate/refund.
  let refund = 0
  const RARITY_REFUND = { common: 5, rare: 10, epic: 25, legendary: 100 }
  const MAX_COPIES = { common: GAME_MAX_COPIES, rare: GAME_MAX_COPIES, epic: GAME_MAX_COPIES, legendary: MAX_LEGENDARY_COPIES }
  const rarityOrder = ['common', 'rare', 'epic', 'legendary']
  const cards = packDef.slots.map((slot) => {
    const rolled = rollRandomRarity()
    const rarity = rarityOrder.indexOf(rolled) > rarityOrder.indexOf(slot.rarity) ? rolled : slot.rarity
    const max = MAX_COPIES[rarity] ?? GAME_MAX_COPIES
    const eligiblePool = CARD_POOL[rarity].filter((cardId) => (owned[cardId] ?? 0) < max)
    const id = eligiblePool.length > 0
      ? eligiblePool[Math.floor(Math.random() * eligiblePool.length)]
      : pickCard(rarity)
    const current = owned[id] ?? 0

    if (current >= max) {
      refund += RARITY_REFUND[rarity] ?? 5
      return { id, rarity, duplicate: true }
    }

    owned[id] = current + 1
    return { id, rarity }
  })

  const netCost = packDef.cost - refund

  const tx = db.transaction(() => {
    if (_deductShards.run(packDef.cost, accountId, packDef.cost).changes !== 1) return false
    if (refund > 0) _grantShards.run(refund, 0, accountId)
    _setOwnedCards.run(JSON.stringify(owned), accountId)
    return true
  })
  if (!tx()) return { ok: false, error: 'Not enough Shards.' }
  // Spend is the gross pack cost; the duplicate refund is separate income and
  // should not net against a "spend N Shards" objective.
  recordQuestEvents(accountId, [
    { type: 'open_packs' },
    { type: 'open_pack_type', packTier: packType },
    { type: 'spend_shards', amount: packDef.cost },
  ])

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    cards,
    refund,
    netCost,
    shards: refreshed.shards,
  }
}

export { PACK_DEFS, ALL_CARDS }

