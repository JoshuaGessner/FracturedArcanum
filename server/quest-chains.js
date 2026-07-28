// Tiered quest chains — the permanent half of the quest system.
//
// These replace the one-shot milestone and skirmish quests, which were the
// system's real dead end: five objectives, all finishable in the first session,
// after which two of the four ledger tabs were permanently empty.
//
// A chain tracks a lifetime total and hands out a reward each time that total
// crosses the next tier. Most chains declare an `endless` tail: once the listed
// tiers are exhausted the chain keeps generating tiers at a fixed step, so
// there is always a next objective no matter how long someone plays. Chains
// without a tail are genuinely finite goals (a full deck, a complete archive)
// where inventing more tiers would be dishonest.
//
// Endless payouts are deliberately poor per unit of effort — 400 shards for
// another 500 wins is a rounding error beside the 30/win match reward. They
// exist to mark progress, not to move the economy.

const ROMAN_NUMERALS = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
]

export const QUEST_CHAINS = [
  {
    id: 'chain-riftbreaker',
    cadence: 'milestone',
    title: 'Riftbreaker',
    description: 'Win {target} battles.',
    category: 'Mastery',
    icon: 'battle',
    objective: { type: 'win_any_match' },
    tiers: [
      { target: 1, shards: 25 },
      { target: 5, shards: 45 },
      { target: 25, shards: 90 },
      { target: 100, shards: 200 },
      { target: 500, shards: 450 },
    ],
    endless: { step: 500, shards: 400 },
  },
  {
    id: 'chain-marathon',
    cadence: 'milestone',
    title: 'Rift Marathon',
    description: 'Complete {target} battles.',
    category: 'Mastery',
    icon: 'momentum',
    objective: { type: 'play_matches' },
    tiers: [
      { target: 10, shards: 30 },
      { target: 50, shards: 70 },
      { target: 250, shards: 160 },
      { target: 1000, shards: 380 },
    ],
    endless: { step: 1000, shards: 350 },
  },
  {
    id: 'chain-duelist',
    cadence: 'milestone',
    title: 'Unbroken Duelist',
    description: 'Reach a {target} battle win streak.',
    category: 'Mastery',
    icon: 'momentum',
    objective: { type: 'reach_streak', mode: 'high_water' },
    tiers: [
      { target: 3, shards: 35 },
      { target: 5, shards: 70 },
      { target: 10, shards: 150 },
      { target: 20, shards: 320 },
    ],
    endless: { step: 5, shards: 250 },
  },
  {
    id: 'chain-sealbreaker',
    cadence: 'milestone',
    title: 'Sealbreaker',
    description: 'Open {target} card packs.',
    category: 'Collection',
    icon: 'pack',
    objective: { type: 'open_packs' },
    tiers: [
      { target: 1, shards: 25 },
      { target: 10, shards: 55 },
      { target: 50, shards: 130 },
      { target: 200, shards: 300 },
    ],
    endless: { step: 200, shards: 300 },
    legacyQuestIds: ['milestone-first-pack'],
  },
  {
    id: 'chain-archivist',
    cadence: 'milestone',
    title: 'Archivist',
    description: 'Collect {target} distinct cards.',
    category: 'Collection',
    icon: 'deck',
    objective: { type: 'collect_cards', mode: 'derived' },
    tiers: [
      { target: 10, shards: 30 },
      { target: 30, shards: 80 },
      { target: 50, shards: 170 },
      { target: 70, shards: 400 },
    ],
  },
  {
    id: 'chain-deckwright',
    cadence: 'milestone',
    title: 'Deckwright',
    description: 'Prepare a full {target}-card battle deck.',
    category: 'Milestone',
    icon: 'deck',
    objective: { type: 'build_deck', mode: 'derived' },
    tiers: [{ target: 14, shards: 30 }],
    legacyQuestIds: ['milestone-full-deck'],
  },
  {
    id: 'chain-shardwright',
    cadence: 'milestone',
    title: 'Shardwright',
    description: 'Break down {target} excess cards.',
    category: 'Economy',
    icon: 'shards',
    objective: { type: 'breakdown_cards' },
    tiers: [
      { target: 5, shards: 25 },
      { target: 25, shards: 60 },
      { target: 150, shards: 140 },
      { target: 750, shards: 320 },
    ],
    endless: { step: 750, shards: 250 },
  },
  {
    id: 'chain-treasury',
    cadence: 'milestone',
    title: 'Treasury Keeper',
    description: 'Spend {target} Shards.',
    category: 'Economy',
    icon: 'shards',
    objective: { type: 'spend_shards' },
    tiers: [
      { target: 500, shards: 30 },
      { target: 2500, shards: 70 },
      { target: 10000, shards: 160 },
      { target: 50000, shards: 380 },
    ],
    endless: { step: 50000, shards: 300 },
  },
  {
    id: 'chain-vault-devotion',
    cadence: 'milestone',
    title: 'Vault Devotion',
    description: 'Collect the daily vault reward on {target} days.',
    category: 'Vault',
    icon: 'shards',
    objective: { type: 'claim_daily' },
    tiers: [
      { target: 7, shards: 40 },
      { target: 30, shards: 100 },
      { target: 100, shards: 220 },
      { target: 365, shards: 500 },
    ],
    endless: { step: 365, shards: 300 },
  },
  {
    id: 'chain-clockwork',
    cadence: 'skirmish',
    title: 'Clockwork Ascendant',
    description: 'Win {target} AI skirmishes.',
    category: 'Skirmish Mastery',
    icon: 'skirmish',
    objective: { type: 'win_ai' },
    tiers: [
      { target: 1, shards: 25 },
      { target: 10, shards: 55 },
      { target: 50, shards: 130 },
      { target: 250, shards: 320 },
    ],
    endless: { step: 250, shards: 300 },
  },
  {
    id: 'chain-adept-path',
    cadence: 'skirmish',
    title: 'Adept Rivalry',
    description: 'Win {target} skirmishes on Adept or higher.',
    category: 'Skirmish Mastery',
    icon: 'skirmish',
    objective: { type: 'win_ai_difficulty', difficulty: 'adept' },
    tiers: [
      { target: 1, shards: 25 },
      { target: 10, shards: 60 },
      { target: 50, shards: 150 },
    ],
    endless: { step: 50, shards: 200 },
    legacyQuestIds: ['skirmish-adept'],
  },
  {
    id: 'chain-veteran-path',
    cadence: 'skirmish',
    title: 'Veteran Breaker',
    description: 'Win {target} skirmishes on Veteran or higher.',
    category: 'Skirmish Mastery',
    icon: 'skirmish',
    objective: { type: 'win_ai_difficulty', difficulty: 'veteran' },
    tiers: [
      { target: 1, shards: 40 },
      { target: 10, shards: 90 },
      { target: 50, shards: 220 },
    ],
    endless: { step: 50, shards: 250 },
    legacyQuestIds: ['skirmish-veteran'],
  },
  {
    id: 'chain-legend-path',
    cadence: 'skirmish',
    title: 'Legendfall',
    description: 'Win {target} skirmishes on Legend.',
    category: 'Skirmish Mastery',
    icon: 'skirmish',
    objective: { type: 'win_ai_difficulty', difficulty: 'legend' },
    tiers: [
      { target: 1, shards: 75 },
      { target: 5, shards: 160 },
      { target: 25, shards: 380 },
    ],
    endless: { step: 25, shards: 350 },
    legacyQuestIds: ['skirmish-legend'],
  },
]

export function getQuestChain(chainId) {
  return QUEST_CHAINS.find((chain) => chain.id === chainId)
}

/** True once every listed tier is claimed and the chain has no endless tail. */
export function isChainExhausted(chain, tierIndex) {
  return !chain.endless && tierIndex >= chain.tiers.length
}

/**
 * The target and payout for a tier index, extending past the listed tiers when
 * the chain has an endless tail.
 */
export function chainTier(chain, tierIndex) {
  if (tierIndex < chain.tiers.length) {
    return { ...chain.tiers[tierIndex], index: tierIndex }
  }
  if (!chain.endless) return null

  const last = chain.tiers[chain.tiers.length - 1]
  const beyond = tierIndex - chain.tiers.length + 1
  return {
    target: last.target + chain.endless.step * beyond,
    shards: chain.endless.shards,
    index: tierIndex,
  }
}

export function chainTierLabel(tierIndex) {
  return ROMAN_NUMERALS[tierIndex] ?? String(tierIndex + 1)
}

/** Chain ids credited with tier 1 for players who claimed the old one-shot quest. */
export function legacyChainMigrations() {
  return QUEST_CHAINS
    .filter((chain) => chain.legacyQuestIds?.length)
    .flatMap((chain) => chain.legacyQuestIds.map((questId) => ({ questId, chainId: chain.id })))
}
