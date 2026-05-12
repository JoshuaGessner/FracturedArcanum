import type { QuestCadence, QuestDefinition, QuestObjectiveType } from './types'

const dailyQuestIds = [
  'daily-first-blood',
  'daily-skirmish-spark',
  'daily-burst-channeler',
  'daily-pack-rite',
  'daily-forge-tidy',
]

const weeklyQuestIds = [
  'weekly-arena-circuit',
  'weekly-ai-gauntlet',
  'weekly-collector',
  'weekly-shardwright',
]

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: 'daily-first-blood',
    cadence: 'daily',
    title: 'First Blood Rite',
    description: 'Win any battle today.',
    category: 'Battle',
    objective: { type: 'win_any_match', target: 1 },
    reward: { shards: 15 },
    icon: 'battle',
  },
  {
    id: 'daily-skirmish-spark',
    cadence: 'daily',
    title: 'Skirmish Spark',
    description: 'Win an AI skirmish.',
    category: 'Skirmish',
    objective: { type: 'win_ai', target: 1 },
    reward: { shards: 15 },
    icon: 'skirmish',
  },
  {
    id: 'daily-burst-channeler',
    cadence: 'daily',
    title: 'Burst Channeler',
    description: 'Complete two battles to charge the arena ledger.',
    category: 'Battle',
    objective: { type: 'play_matches', target: 2 },
    reward: { shards: 20 },
    icon: 'momentum',
  },
  {
    id: 'daily-pack-rite',
    cadence: 'daily',
    title: 'Seal Breaker',
    description: 'Open a card pack.',
    category: 'Collection',
    objective: { type: 'open_packs', target: 1 },
    reward: { shards: 10 },
    icon: 'pack',
  },
  {
    id: 'daily-forge-tidy',
    cadence: 'daily',
    title: 'Forge Tidy',
    description: 'Break down an excess card.',
    category: 'Economy',
    objective: { type: 'breakdown_cards', target: 1 },
    reward: { shards: 10 },
    icon: 'shards',
  },
  {
    id: 'weekly-arena-circuit',
    cadence: 'weekly',
    title: 'Arena Circuit',
    description: 'Complete five battles this week.',
    category: 'Battle',
    objective: { type: 'play_matches', target: 5 },
    reward: { shards: 45 },
    icon: 'battle',
  },
  {
    id: 'weekly-ai-gauntlet',
    cadence: 'weekly',
    title: 'Clockwork Gauntlet',
    description: 'Win three AI skirmishes this week.',
    category: 'Skirmish',
    objective: { type: 'win_ai', target: 3 },
    reward: { shards: 50 },
    icon: 'skirmish',
  },
  {
    id: 'weekly-collector',
    cadence: 'weekly',
    title: 'Archive Expansion',
    description: 'Open three packs this week.',
    category: 'Collection',
    objective: { type: 'open_packs', target: 3 },
    reward: { shards: 35 },
    icon: 'pack',
  },
  {
    id: 'weekly-shardwright',
    cadence: 'weekly',
    title: 'Shardwright',
    description: 'Break down five excess cards this week.',
    category: 'Economy',
    objective: { type: 'breakdown_cards', target: 5 },
    reward: { shards: 40 },
    icon: 'shards',
  },
  {
    id: 'milestone-full-deck',
    cadence: 'milestone',
    title: 'Forge A Full Deck',
    description: 'Prepare a full 14-card battle deck.',
    category: 'Milestone',
    objective: { type: 'build_deck', target: 14 },
    reward: { shards: 30 },
    icon: 'deck',
  },
  {
    id: 'milestone-first-pack',
    cadence: 'milestone',
    title: 'First Seal Opened',
    description: 'Open your first card pack.',
    category: 'Milestone',
    objective: { type: 'open_packs', target: 1 },
    reward: { shards: 25 },
    icon: 'pack',
  },
  {
    id: 'skirmish-adept',
    cadence: 'skirmish',
    title: 'Adept Rivalry',
    description: 'Win an AI skirmish on Adept or higher.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', target: 1, difficulty: 'adept' },
    reward: { shards: 25 },
    icon: 'skirmish',
  },
  {
    id: 'skirmish-veteran',
    cadence: 'skirmish',
    title: 'Veteran Breaker',
    description: 'Win an AI skirmish on Veteran or higher.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', target: 1, difficulty: 'veteran' },
    reward: { shards: 40 },
    icon: 'skirmish',
  },
  {
    id: 'skirmish-legend',
    cadence: 'skirmish',
    title: 'Legendfall',
    description: 'Win an AI skirmish on Legend.',
    category: 'Skirmish Mastery',
    objective: { type: 'win_ai_difficulty', target: 1, difficulty: 'legend' },
    reward: { shards: 75 },
    icon: 'skirmish',
  },
]

export const QUEST_CADENCE_LABELS: Record<QuestCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  milestone: 'Milestones',
  skirmish: 'Skirmish',
}

export const QUEST_OBJECTIVE_LABELS: Record<QuestObjectiveType, string> = {
  win_any_match: 'Battle win',
  win_ai: 'AI victory',
  win_ai_difficulty: 'Difficulty win',
  play_matches: 'Battles played',
  open_packs: 'Packs opened',
  breakdown_cards: 'Cards broken down',
  claim_daily: 'Daily claimed',
  build_deck: 'Deck forged',
}

export function getQuestDefinition(questId: string): QuestDefinition | undefined {
  return QUEST_DEFINITIONS.find((quest) => quest.id === questId)
}

export function getFallbackQuestIds(cadence: QuestCadence): string[] {
  if (cadence === 'daily') return dailyQuestIds.slice(0, 3)
  if (cadence === 'weekly') return weeklyQuestIds.slice(0, 3)
  return QUEST_DEFINITIONS.filter((quest) => quest.cadence === cadence).map((quest) => quest.id)
}
