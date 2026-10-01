import { useEffect, useRef, useState } from 'react'
import { diffHealth } from '../utils'

export type HealthPop = {
  id: number
  delta: number
}

const POP_LIFETIME_MS = 1100

/**
 * Floating numbers over whatever just took damage or healed — the readout
 * every card game in the genre puts on the unit itself, so a trade can be
 * read without comparing numbers before and after.
 *
 * `snapshot` maps a hero key or unit uid to its current health. `round` is
 * the turn number: when it goes backwards a new match has started, and the
 * jump from the old match's health to a fresh hero's is a reset, not a heal,
 * so the baseline is taken again without popping anything.
 */
export function useHealthPops(snapshot: Record<string, number>, round: number): Record<string, HealthPop> {
  const previous = useRef({ snapshot, round })
  const nextId = useRef(0)
  const timers = useRef(new Set<number>())
  const [pops, setPops] = useState<Record<string, HealthPop>>({})
  const signature = JSON.stringify(snapshot)

  useEffect(() => {
    const before = previous.current
    const current = JSON.parse(signature) as Record<string, number>
    previous.current = { snapshot: current, round }
    if (round < before.round) return

    const changes = diffHealth(before.snapshot, current)
    if (changes.length === 0) return

    const fresh = Object.fromEntries(changes.map((change) => {
      nextId.current += 1
      return [change.key, { id: nextId.current, delta: change.delta }]
    }))
    setPops((existing) => ({ ...existing, ...fresh }))

    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setPops((existing) => Object.fromEntries(
        Object.entries(existing).filter(([key, pop]) => fresh[key]?.id !== pop.id),
      ))
    }, POP_LIFETIME_MS)
    timers.current.add(timer)
  }, [signature, round])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer))
      pending.clear()
    }
  }, [])

  return pops
}
