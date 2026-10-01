import type { CSSProperties } from 'react'

const BURST_COST = 3
const MAX_MOMENTUM = 10

type BurstMedallionProps = {
  momentum: number
  onBurst: () => void
  disabled: boolean
}

/**
 * Momentum and the one thing it buys, as a single object.
 *
 * Momentum used to be a small orb on the hero plaque and Burst a plain text
 * button in the dock, so the player had to connect the two. The genre's
 * answer — Hearthstone's hero power, Runeterra's attack token — is a round
 * control that shows its own charge: the ring fills toward 10, a notch marks
 * the cost of 3, and the medallion lights once it can be spent.
 */
export function BurstMedallion({ momentum, onBurst, disabled }: BurstMedallionProps) {
  const charged = momentum >= BURST_COST
  const fill = Math.min(MAX_MOMENTUM, Math.max(0, momentum)) / MAX_MOMENTUM
  return (
    <button
      type="button"
      className={`burst-medallion${charged ? ' is-charged' : ''}`}
      onClick={onBurst}
      disabled={disabled}
      aria-label={`Burst: 2 damage to the enemy hero and draw a card. Momentum ${momentum} of ${MAX_MOMENTUM}, costs ${BURST_COST}.`}
      style={{
        '--burst-fill': `${fill * 360}deg`,
        '--burst-notch': `${(BURST_COST / MAX_MOMENTUM) * 360}deg`,
      } as CSSProperties}
    >
      <span className="burst-medallion-ring" aria-hidden="true">
        <span className="burst-medallion-core">{momentum}</span>
      </span>
      <span className="burst-medallion-label" aria-hidden="true">Burst</span>
    </button>
  )
}
