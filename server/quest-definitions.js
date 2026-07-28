// Server-owned quest catalog. The client never carries a copy — definitions
// travel with every /api/me/quests response.
//
// Shape notes:
//   tier      picks which slot a rotating quest can land in, so a board always
//             mixes one quick objective, one medium, and one demanding one.
//   variants  are explicit (target, shards) pairs rather than a scaling
//             formula, so every possible payout is auditable against the bands
//             in docs/ECONOMY_BALANCE.md rather than emerging from arithmetic.
//   objective.mode
//             'accumulate' (default) counts events; 'high_water' keeps the best
//             single value seen, for "reach a streak of N" style goals.
//
// Permanent progression lives in server/quest-chains.js as tiered chains. The
// one-shot milestone and skirmish quests that used to sit here were the dead
// end this system had: five objectives, all finishable in one session, leaving
// two ledger tabs permanently empty afterwards.
//
// Rotating quests are deliberately limited to objectives a player can always
// finish alone. Anything gated on another person (trades, friend matches), on
// a populated ranked queue, or on a finite catalog (cosmetics) would be a dead
// end on a timer, so those belong in the permanent tiers instead.

export const QUEST_DIFFICULTY_ORDER = ['novice', 'adept', 'veteran', 'legend']

export const QUEST_TIERS = ['light', 'standard', 'hard']

export const QUEST_DEFINITIONS = [
  // ─── Daily · light ────────────────────────────────────────────────────────
  {
    id: 'daily-first-blood',
    cadence: 'daily',
    tier: 'light',
    title: 'First Blood Rite',
    description: 'Win any battle today.',
    category: 'Battle',
    objective: { type: 'win_any_match' },
    variants: [{ target: 1, shards: 10 }],
    icon: 'battle',
  },
  {
    id: 'daily-skirmish-spark',
    cadence: 'daily',
    tier: 'light',
    title: 'Skirmish Spark',
    description: 'Win an AI skirmish.',
    category: 'Skirmish',
    objective: { type: 'win_ai' },
    variants: [{ target: 1, shards: 10 }],
    icon: 'skirmish',
  },
  {
    id: 'daily-pack-rite',
    cadence: 'daily',
    tier: 'light',
    title: 'Seal Breaker',
    description: 'Open a card pack.',
    category: 'Collection',
    objective: { type: 'open_packs' },
    variants: [{ target: 1, shards: 10 }],
    icon: 'pack',
  },
  {
    id: 'daily-forge-tidy',
    cadence: 'daily',
    tier: 'light',
    title: 'Forge Tidy',
    description: 'Break down {target} excess cards.',
    category: 'Economy',
    objective: { type: 'breakdown_cards' },
    variants: [{ target: 1, shards: 10 }, { target: 2, shards: 12 }],
    icon: 'shards',
  },
  {
    id: 'daily-vault-rite',
    cadence: 'daily',
    tier: 'light',
    title: 'Vault Rite',
    description: 'Collect your daily vault reward.',
    category: 'Vault',
    objective: { type: 'claim_daily' },
    variants: [{ target: 1, shards: 10 }],
    icon: 'shards',
  },
  {
    id: 'daily-warmup',
    cadence: 'daily',
    tier: 'light',
    title: 'Rift Warmup',
    description: 'Complete {target} battles.',
    category: 'Battle',
    objective: { type: 'play_matches' },
    variants: [{ target: 2, shards: 10 }, { target: 3, shards: 12 }],
    icon: 'momentum',
  },

  // ─── Daily · standard ─────────────────────────────────────────────────────
  {
    id: 'daily-burst-channeler',
    cadence: 'daily',
    tier: 'standard',
    title: 'Burst Channeler',
    description: 'Complete {target} battles to charge the arena ledger.',
    category: 'Battle',
    objective: { type: 'play_matches' },
    variants: [{ target: 3, shards: 14 }, { target: 4, shards: 16 }],
    icon: 'momentum',
  },
  {
    id: 'daily-double-strike',
    cadence: 'daily',
    tier: 'standard',
    title: 'Double Strike',
    description: 'Win {target} battles.',
    category: 'Battle',
    objective: { type: 'win_any_match' },
    variants: [{ target: 2, shards: 14 }, { target: 3, shards: 16 }],
    icon: 'battle',
  },
  {
    id: 'daily-adept-trial',
    cadence: 'daily',
    tier: 'standard',
    title: 'Adept Rivalry',
    description: 'Win {target} AI skirmishes on Adept or higher.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', difficulty: 'adept' },
    variants: [{ target: 1, shards: 14 }, { target: 2, shards: 16 }],
    icon: 'skirmish',
  },
  {
    id: 'daily-salvage-run',
    cadence: 'daily',
    tier: 'standard',
    title: 'Salvage Run',
    description: 'Break down {target} excess cards.',
    category: 'Economy',
    objective: { type: 'breakdown_cards' },
    variants: [{ target: 4, shards: 14 }, { target: 5, shards: 16 }],
    icon: 'shards',
  },
  {
    id: 'daily-twin-seal',
    cadence: 'daily',
    tier: 'standard',
    title: 'Twin Seal',
    description: 'Open {target} card packs.',
    category: 'Collection',
    objective: { type: 'open_packs' },
    variants: [{ target: 2, shards: 14 }, { target: 3, shards: 16 }],
    icon: 'pack',
  },
  {
    id: 'daily-shardflow',
    cadence: 'daily',
    tier: 'standard',
    title: 'Shardflow',
    description: 'Spend {target} Shards.',
    category: 'Economy',
    objective: { type: 'spend_shards' },
    variants: [{ target: 100, shards: 14 }, { target: 150, shards: 16 }],
    icon: 'shards',
  },
  {
    id: 'daily-momentum-run',
    cadence: 'daily',
    tier: 'standard',
    title: 'Momentum Run',
    description: 'Reach a {target} battle win streak.',
    category: 'Battle',
    objective: { type: 'reach_streak', mode: 'high_water' },
    variants: [{ target: 2, shards: 14 }, { target: 3, shards: 16 }],
    icon: 'momentum',
  },

  // ─── Daily · hard ─────────────────────────────────────────────────────────
  {
    id: 'daily-veteran-trial',
    cadence: 'daily',
    tier: 'hard',
    title: 'Veteran Breaker',
    description: 'Win {target} AI skirmishes on Veteran or higher.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', difficulty: 'veteran' },
    variants: [{ target: 1, shards: 18 }, { target: 2, shards: 20 }],
    icon: 'skirmish',
  },
  {
    id: 'daily-legend-trial',
    cadence: 'daily',
    tier: 'hard',
    title: 'Legendfall',
    description: 'Win an AI skirmish on Legend.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', difficulty: 'legend' },
    variants: [{ target: 1, shards: 20 }],
    icon: 'skirmish',
  },
  {
    id: 'daily-endurance',
    cadence: 'daily',
    tier: 'hard',
    title: 'Rift Endurance',
    description: 'Complete {target} battles.',
    category: 'Battle',
    objective: { type: 'play_matches' },
    variants: [{ target: 5, shards: 18 }, { target: 6, shards: 20 }],
    icon: 'momentum',
  },
  {
    id: 'daily-triumph',
    cadence: 'daily',
    tier: 'hard',
    title: 'Clockwork Triumph',
    description: 'Win {target} AI skirmishes.',
    category: 'Skirmish',
    objective: { type: 'win_ai' },
    variants: [{ target: 3, shards: 18 }, { target: 4, shards: 20 }],
    icon: 'skirmish',
  },
  {
    id: 'daily-premium-seal',
    cadence: 'daily',
    tier: 'hard',
    title: 'Premium Seal',
    description: 'Open a Premium or Legendary pack.',
    category: 'Collection',
    objective: { type: 'open_pack_type', packTier: 'premium' },
    variants: [{ target: 1, shards: 18 }],
    icon: 'pack',
  },

  // ─── Weekly · light ───────────────────────────────────────────────────────
  {
    id: 'weekly-arena-circuit',
    cadence: 'weekly',
    tier: 'light',
    title: 'Arena Circuit',
    description: 'Complete {target} battles this week.',
    category: 'Battle',
    objective: { type: 'play_matches' },
    variants: [{ target: 8, shards: 35 }, { target: 10, shards: 38 }],
    icon: 'battle',
  },
  {
    id: 'weekly-collector',
    cadence: 'weekly',
    tier: 'light',
    title: 'Archive Expansion',
    description: 'Open {target} packs this week.',
    category: 'Collection',
    objective: { type: 'open_packs' },
    variants: [{ target: 4, shards: 35 }, { target: 5, shards: 38 }],
    icon: 'pack',
  },
  {
    id: 'weekly-shardwright',
    cadence: 'weekly',
    tier: 'light',
    title: 'Shardwright',
    description: 'Break down {target} excess cards this week.',
    category: 'Economy',
    objective: { type: 'breakdown_cards' },
    variants: [{ target: 10, shards: 35 }, { target: 12, shards: 38 }],
    icon: 'shards',
  },
  {
    id: 'weekly-devotion',
    cadence: 'weekly',
    tier: 'light',
    title: 'Weekly Devotion',
    description: 'Collect the daily vault reward on {target} days.',
    category: 'Vault',
    objective: { type: 'claim_daily' },
    variants: [{ target: 4, shards: 35 }, { target: 5, shards: 38 }],
    icon: 'shards',
  },

  // ─── Weekly · standard ────────────────────────────────────────────────────
  {
    id: 'weekly-ai-gauntlet',
    cadence: 'weekly',
    tier: 'standard',
    title: 'Clockwork Gauntlet',
    description: 'Win {target} AI skirmishes this week.',
    category: 'Skirmish',
    objective: { type: 'win_ai' },
    variants: [{ target: 6, shards: 44 }, { target: 8, shards: 46 }],
    icon: 'skirmish',
  },
  {
    id: 'weekly-victor',
    cadence: 'weekly',
    tier: 'standard',
    title: 'Rift Victor',
    description: 'Win {target} battles this week.',
    category: 'Battle',
    objective: { type: 'win_any_match' },
    variants: [{ target: 8, shards: 44 }, { target: 10, shards: 46 }],
    icon: 'battle',
  },
  {
    id: 'weekly-adept-circuit',
    cadence: 'weekly',
    tier: 'standard',
    title: 'Adept Circuit',
    description: 'Win {target} skirmishes on Adept or higher this week.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', difficulty: 'adept' },
    variants: [{ target: 4, shards: 44 }, { target: 5, shards: 46 }],
    icon: 'skirmish',
  },
  {
    id: 'weekly-treasury',
    cadence: 'weekly',
    tier: 'standard',
    title: 'Treasury Drain',
    description: 'Spend {target} Shards this week.',
    category: 'Economy',
    objective: { type: 'spend_shards' },
    variants: [{ target: 500, shards: 44 }, { target: 700, shards: 46 }],
    icon: 'shards',
  },

  // ─── Weekly · hard ────────────────────────────────────────────────────────
  {
    id: 'weekly-veteran-siege',
    cadence: 'weekly',
    tier: 'hard',
    title: 'Veteran Siege',
    description: 'Win {target} skirmishes on Veteran or higher this week.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', difficulty: 'veteran' },
    variants: [{ target: 3, shards: 48 }, { target: 4, shards: 50 }],
    icon: 'skirmish',
  },
  {
    id: 'weekly-legendfall',
    cadence: 'weekly',
    tier: 'hard',
    title: 'Legend Unmade',
    description: 'Win {target} skirmishes on Legend this week.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', difficulty: 'legend' },
    variants: [{ target: 2, shards: 50 }],
    icon: 'skirmish',
  },
  {
    id: 'weekly-ascent',
    cadence: 'weekly',
    tier: 'hard',
    title: 'Unbroken Ascent',
    description: 'Reach a {target} battle win streak this week.',
    category: 'Battle',
    objective: { type: 'reach_streak', mode: 'high_water' },
    variants: [{ target: 5, shards: 48 }, { target: 6, shards: 50 }],
    icon: 'momentum',
  },
  {
    id: 'weekly-marathon',
    cadence: 'weekly',
    tier: 'hard',
    title: 'Rift Marathon',
    description: 'Complete {target} battles this week.',
    category: 'Battle',
    objective: { type: 'play_matches' },
    variants: [{ target: 20, shards: 48 }, { target: 25, shards: 50 }],
    icon: 'momentum',
  },

]

export function getQuestDefinition(questId) {
  return QUEST_DEFINITIONS.find((quest) => quest.id === questId)
}

/** The variant a permanent quest always uses, and the fallback for rotating ones. */
export function baseVariant(quest) {
  return quest.variants[0]
}

export function renderQuestDescription(quest, target) {
  return quest.description.replace('{target}', String(target))
}

export function difficultyMeets(actual, required) {
  const actualIndex = QUEST_DIFFICULTY_ORDER.indexOf(actual)
  const requiredIndex = QUEST_DIFFICULTY_ORDER.indexOf(required)
  return actualIndex !== -1 && requiredIndex !== -1 && actualIndex >= requiredIndex
}
