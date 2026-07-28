import { useState } from 'react'
import { UI_ASSETS } from '../constants'
import { QUEST_CADENCE_LABELS } from '../quests'
import type { QuestCadence, QuestOverview, QuestProgress } from '../types'

type QuestLedgerPanelProps = {
  overview: QuestOverview | null
  onBack: () => void
  onClaimQuest: (questId: string) => void
  onClaimQuests: (questIds: string[]) => void
}

const QUEST_TABS: QuestCadence[] = ['daily', 'weekly', 'milestone', 'skirmish']

const questIconAsset: Record<QuestProgress['icon'], string> = {
  battle: UI_ASSETS.tiles.battle,
  skirmish: UI_ASSETS.tiles.play,
  momentum: UI_ASSETS.pips.momentumFilled,
  pack: UI_ASSETS.packs.standard,
  shards: UI_ASSETS.tiles.shop,
  deck: UI_ASSETS.tiles.collection,
}

function QuestCard({ quest, onClaimQuest }: { quest: QuestProgress; onClaimQuest: (questId: string) => void }) {
  const progressPercent = Math.round((Math.min(quest.progress, quest.target) / quest.target) * 100)
  const stateLabel = quest.claimed ? 'Claimed' : quest.completed ? 'Ready' : `${quest.progress}/${quest.target}`

  return (
    <article className={`quest-ledger-card ${quest.completed ? 'is-complete' : ''} ${quest.claimed ? 'is-claimed' : ''}`.trim()}>
      <div className="quest-ledger-card-icon" aria-hidden="true">
        <img src={questIconAsset[quest.icon]} alt="" />
      </div>
      <div className="quest-ledger-card-main">
        <div className="quest-ledger-card-title">
          <span>{quest.category}</span>
          <strong>{quest.title}</strong>
        </div>
        <p>{quest.description}</p>
        <div className="quest-progress-track" aria-label={`${quest.title} progress ${quest.progress} of ${quest.target}`}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
      <div className="quest-ledger-card-reward">
        <span className={`quest-state-chip ${quest.completed && !quest.claimed ? 'is-ready' : ''}`.trim()}>{stateLabel}</span>
        <strong>+{quest.reward.shards}</strong>
        <span>Shards</span>
        <button className="primary mini" onClick={() => onClaimQuest(quest.id)} disabled={!quest.completed || quest.claimed}>
          Claim
        </button>
      </div>
    </article>
  )
}

export function QuestLedgerPanel({ overview, onBack, onClaimQuest, onClaimQuests }: QuestLedgerPanelProps) {
  const [activeTab, setActiveTab] = useState<QuestCadence>('daily')
  const quests = overview?.quests ?? []
  const visibleQuests = quests.filter((quest) => quest.cadence === activeTab)
  const claimable = visibleQuests.filter((quest) => quest.completed && !quest.claimed)
  const completed = visibleQuests.filter((quest) => quest.completed).length
  const totalReward = claimable.reduce((sum, quest) => sum + quest.reward.shards, 0)

  return (
    <div className="quest-ledger-panel">
      <div className="quest-ledger-toolbar">
        <button className="ghost mini subview-back-btn" onClick={onBack}>Back</button>
        <div>
          <span className="subview-label">Quest Ledger</span>
          <strong>{QUEST_CADENCE_LABELS[activeTab]}</strong>
        </div>
        <span className="badge">{claimable.length} Ready</span>
      </div>

      <div className="quest-ledger-hero">
        <div className="quest-ledger-hero-medallion">
          <img src={UI_ASSETS.overlays.ribbonNew} alt="" />
          <strong>{overview?.summary.claimable ?? 0}</strong>
          <span>Rewards</span>
        </div>
        <div className="quest-ledger-hero-copy">
          <span className="subview-label">Arena Contracts</span>
          <strong>{completed}/{visibleQuests.length} {QUEST_CADENCE_LABELS[activeTab]} Complete</strong>
          <p className="note">{claimable.length > 0 ? `${totalReward} Shards waiting in this ledger.` : 'Fresh contracts rotate through battle, collection, and skirmish mastery.'}</p>
        </div>
      </div>

      <div className="quest-ledger-tabs" aria-label="Quest categories" data-scene-swipe-opt-out="true">
        {QUEST_TABS.map((tab) => {
          const count = quests.filter((quest) => quest.cadence === tab && quest.completed && !quest.claimed).length
          return (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
              {QUEST_CADENCE_LABELS[tab]}{count > 0 ? ` ${count}` : ''}
            </button>
          )
        })}
      </div>

      {claimable.length > 1 && (
        <div className="quest-claim-all-row">
          <button className="primary" onClick={() => onClaimQuests(claimable.map((quest) => quest.id))}>
            Claim Ready Rewards
          </button>
        </div>
      )}

      <div className="quest-ledger-list">
        {visibleQuests.length > 0 ? (
          visibleQuests.map((quest) => <QuestCard key={`${quest.id}-${quest.periodKey}`} quest={quest} onClaimQuest={onClaimQuest} />)
        ) : (
          <div className="quest-ledger-empty">
            <strong>No contracts posted</strong>
            <span>Check another ledger tab.</span>
          </div>
        )}
      </div>
    </div>
  )
}
