import { UI_ASSETS } from '../constants'
import type { QuestOverview, QuestProgress } from '../types'

type FallbackQuestItem = {
  complete: boolean
  label: string
}


type HomeQuestBoardProps = {
  overview: QuestOverview | null
  fallbackItems: FallbackQuestItem[]
  questsDone: number
  questTotal: number
  readyQuestRewards: number
  questRewardLabel: string
  onOpenLedger: () => void
}

type QuestBoardItem = {
  id: string
  title: string
  category: string
  description: string
  progress: number
  target: number
  completed: boolean
  claimed: boolean
  rewardShards: number
}

function questPriority(quest: QuestProgress): number {
  if (quest.completed && !quest.claimed) return 0
  if (!quest.completed) return quest.cadence === 'daily' ? 1 : 2
  return 3
}

function toQuestBoardItem(quest: QuestProgress): QuestBoardItem {
  return {
    id: quest.id,
    title: quest.title,
    category: quest.category,
    description: quest.description,
    progress: quest.progress,
    target: quest.target,
    completed: quest.completed,
    claimed: quest.claimed,
    rewardShards: quest.reward.shards,
  }
}

function toFallbackQuestItem(item: FallbackQuestItem, index: number): QuestBoardItem {
  return {
    id: `fallback-${index}`,
    title: item.label,
    category: index === 0 ? 'Daily' : 'Home Goal',
    description: item.complete ? 'Contract secured.' : 'Complete this objective to advance the board.',
    progress: item.complete ? 1 : 0,
    target: 1,
    completed: item.complete,
    claimed: false,
    rewardShards: 0,
  }
}

function getProgressPercent(item: QuestBoardItem): number {
  if (item.target <= 0) return 0
  return Math.round((Math.min(item.progress, item.target) / item.target) * 100)
}

function getQuestStateLabel(item: QuestBoardItem): string {
  if (item.claimed) return 'Claimed'
  if (item.completed) return 'Ready'
  return `${item.progress}/${item.target}`
}

export function HomeQuestBoard({
  overview,
  fallbackItems,
  questsDone,
  questTotal,
  readyQuestRewards,
  questRewardLabel,
  onOpenLedger,
}: HomeQuestBoardProps) {
  const boardItems = overview?.quests.length
    ? [...overview.quests]
        .sort((left, right) => questPriority(left) - questPriority(right))
        .map(toQuestBoardItem)
    : fallbackItems.map(toFallbackQuestItem)
  const featuredQuest = boardItems.find((quest) => !quest.claimed && !quest.completed) ?? boardItems.find((quest) => quest.completed && !quest.claimed) ?? boardItems[0]
  const previewItems = boardItems.filter((quest) => quest.id !== featuredQuest?.id).slice(0, 3)
  const rewardTone = readyQuestRewards > 0 ? 'is-ready' : ''
  const ctaLabel = readyQuestRewards > 0 ? 'Open Rewards Ledger' : 'Open Quest Ledger'
  const featuredProgress = featuredQuest ? getProgressPercent(featuredQuest) : 0

  return (
    <section className={`home-quest-board ${rewardTone}`.trim()} aria-labelledby="home-quest-board-title">
      <div className="home-quest-board-glow" aria-hidden="true" />
      <div className="home-quest-board-header">
        <div className="home-quest-board-title">
          <img src={UI_ASSETS.overlays.ribbonNew} alt="" aria-hidden="true" />
          <div>
            <span className="subview-label">Quest Board</span>
            <strong id="home-quest-board-title">{questsDone}/{questTotal} Contracts</strong>
          </div>
        </div>
        <span className={`home-quest-ready-badge ${rewardTone}`.trim()}>{readyQuestRewards} Ready</span>
      </div>

      {featuredQuest && (
        <div className="home-featured-contract">
          <div className="home-featured-contract-copy">
            <span>{featuredQuest.category}</span>
            <strong>{featuredQuest.title}</strong>
            <p>{featuredQuest.description}</p>
          </div>
          <div className="home-featured-contract-reward">
            <span>{getQuestStateLabel(featuredQuest)}</span>
            <strong>{featuredQuest.rewardShards > 0 ? `+${featuredQuest.rewardShards}` : questRewardLabel}</strong>
            {featuredQuest.rewardShards > 0 && <small>Shards</small>}
          </div>
          <div className="home-contract-progress" aria-label={`${featuredQuest.title} progress ${featuredQuest.progress} of ${featuredQuest.target}`}>
            <span style={{ width: `${featuredProgress}%` }} />
          </div>
        </div>
      )}

      <div className="home-contract-preview-list" aria-label="Current quest previews">
        {previewItems.map((quest) => (
          <div className="home-contract-preview" key={quest.id}>
            <span className={quest.completed ? 'is-complete' : ''} aria-hidden="true" />
            <strong>{quest.title}</strong>
            <small>{getQuestStateLabel(quest)}</small>
          </div>
        ))}
      </div>

      <div className="home-quest-board-footer">
        <span>{questRewardLabel}</span>
        <button type="button" className="primary home-open-ledger-cta" onClick={onOpenLedger}>
          {ctaLabel}
        </button>
      </div>
    </section>
  )
}