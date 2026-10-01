import type { HealthPop } from '../hooks/useHealthPops'

/**
 * The floating "-3" / "+2" over a unit or hero. Decorative: the health value
 * itself, and its spoken label, already changed.
 */
export function HealthPopBadge({ pop }: { pop: HealthPop | undefined }) {
  if (!pop) return null
  return (
    <span key={pop.id} className={`health-pop ${pop.delta < 0 ? 'is-damage' : 'is-heal'}`} aria-hidden="true">
      {pop.delta > 0 ? `+${pop.delta}` : pop.delta}
    </span>
  )
}
