import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CARD_LIBRARY, RARITY_COLORS } from '../game'
import type { CardCollection, OpenedPackCard } from '../types'
import { UI_ASSETS } from '../constants'
import { cardArtPath, getPackArtPath, handleCardArtError, pulseFeedback } from '../utils'
import { playSound } from '../audio'
import { RarityBadge } from './AssetBadge'

type CeremonyPhase = 'intro' | 'shake' | 'burst' | 'fan' | 'reveal' | 'done'

type PackCeremonyOverlayProps = {
  cards: OpenedPackCard[]
  packId: string
  packCost: number
  runes: number
  prevCollection: CardCollection
  soundEnabled: boolean
  hapticsEnabled: boolean
  packOpening: string | null
  onOpenAnother: () => void
  onClose: () => void
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function PackCeremonyOverlay({
  cards,
  packId,
  packCost,
  runes,
  prevCollection,
  soundEnabled,
  hapticsEnabled,
  packOpening,
  onOpenAnother,
  onClose,
}: PackCeremonyOverlayProps) {
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => detectReducedMotion())
  const [phase, setPhase] = useState<CeremonyPhase>(() => (detectReducedMotion() ? 'reveal' : 'intro'))
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => false))
  const [shakeKey, setShakeKey] = useState<number>(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const ceremonySignature = useMemo(
    () => `${packId}:${cards.map((card) => `${card.id}:${card.rarity}:${card.duplicate ? 'dup' : 'new'}`).join('|')}`,
    [cards, packId],
  )

  // Keep reduced-motion preference in sync with OS.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Pre-compute which cards are first-time discoveries (NEW! ribbon).
  const firstTimeMap = useMemo(() => {
    const seen = new Set<string>()
    const flags: boolean[] = []
    cards.forEach((card) => {
      const ownedBefore = (prevCollection[card.id] ?? 0) > 0
      const alreadyFlagged = seen.has(card.id)
      const isNew = !ownedBefore && !alreadyFlagged
      if (isNew) seen.add(card.id)
      flags.push(isNew)
    })
    return flags
  }, [cards, prevCollection])

  // Sequence the ceremony beats. Reduced motion collapses to a single tick
  // so the player still gets the same outcome with no shake/burst.
  useEffect(() => {
    timersRef.current.forEach((id) => clearTimeout(id))
    timersRef.current = []

    if (cards.length === 0) return undefined

    const schedule = (delay: number, callback: () => void) => {
      const id = window.setTimeout(callback, delay)
      timersRef.current.push(id)
    }

    schedule(0, () => {
      setShakeKey(0)
      setFlipped(cards.map(() => false))
      setPhase(reducedMotion ? 'reveal' : 'intro')
    })

    if (reducedMotion) {
      schedule(0, () => {
        playSound('packOpen', soundEnabled)
      })
      return () => {
        timersRef.current.forEach((id) => clearTimeout(id))
        timersRef.current = []
      }
    }

    schedule(180, () => {
      setPhase('shake')
      playSound('packOpen', soundEnabled)
      pulseFeedback(20, hapticsEnabled)
    })
    schedule(760, () => {
      setPhase('burst')
      playSound('lidSplit', soundEnabled)
      pulseFeedback(28, hapticsEnabled)
    })
    schedule(1180, () => {
      setPhase('fan')
      cards.forEach((_, idx) => {
        schedule(60 + idx * 80, () => playSound('cardArc', soundEnabled))
      })
    })
    schedule(1180 + cards.length * 80 + 240, () => setPhase('reveal'))

    return () => {
      timersRef.current.forEach((id) => clearTimeout(id))
      timersRef.current = []
    }
  }, [cards, ceremonySignature, reducedMotion, soundEnabled, hapticsEnabled])

  const allFlipped = flipped.length > 0 && flipped.every(Boolean)

  // When all cards have been revealed, mark the ceremony done so footer
  // controls become enabled.
  useEffect(() => {
    if (phase !== 'reveal' || !allFlipped || cards.length === 0) return undefined
    const id = window.setTimeout(() => setPhase('done'), 220)
    return () => window.clearTimeout(id)
  }, [phase, allFlipped, cards.length])

  const handleFlipCard = useCallback(
    (index: number) => {
      if (flipped[index]) return
      setFlipped((prev) => {
        if (prev[index]) return prev
        const next = [...prev]
        next[index] = true
        return next
      })

      const card = cards[index]
      const isLegendary = card.rarity.toLowerCase() === 'legendary'
      const isFirstTime = firstTimeMap[index]

      if (isLegendary) {
        playSound('legendaryReveal', soundEnabled)
        pulseFeedback(40, hapticsEnabled)
        if (!reducedMotion) {
          setShakeKey((k) => k + 1)
        }
      } else {
        playSound('cardReveal', soundEnabled)
        pulseFeedback(12, hapticsEnabled)
      }

      if (isFirstTime) {
        // Slight delay so the bell sits on top of the rarity cue.
        window.setTimeout(() => playSound('firstTime', soundEnabled), 180)
      }
    },
    [cards, firstTimeMap, flipped, reducedMotion, soundEnabled, hapticsEnabled],
  )

  const handleRevealAll = useCallback(() => {
    cards.forEach((_, idx) => {
      if (!flipped[idx]) handleFlipCard(idx)
    })
  }, [cards, flipped, handleFlipCard])

  const handleSkipToReveal = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id))
    timersRef.current = []
    setPhase('reveal')
  }, [])

  const canOpenAnother = runes >= packCost && packOpening === null

  if (cards.length === 0) return null

  const showPackArt = phase === 'intro' || phase === 'shake' || phase === 'burst'
  const showBurst = phase === 'burst' || phase === 'fan' || phase === 'reveal' || phase === 'done'
  const showFan = phase === 'fan' || phase === 'reveal' || phase === 'done'
  const stageClass = [
    'pack-ceremony-stage',
    `phase-${phase}`,
    reducedMotion ? 'reduced-motion' : '',
    shakeKey > 0 ? `legendary-shake-${shakeKey % 2 === 0 ? 'a' : 'b'}` : '',
  ].filter(Boolean).join(' ')

  return (
    <section
      className="pack-ceremony-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Card pack opening"
      data-scene-swipe-opt-out="true"
    >
      <div className={stageClass}>
        {showPackArt && (
          <div className={`pack-ceremony-pack pack-ceremony-pack-${phase}`}>
            <img src={getPackArtPath(packId)} alt={`${packId} pack`} draggable={false} />
            {phase === 'burst' && (
              <span className="pack-ceremony-lid" aria-hidden="true">
                <span className="pack-ceremony-lid-half left" />
                <span className="pack-ceremony-lid-half right" />
              </span>
            )}
          </div>
        )}

        {showBurst && (
          <img
            className={`pack-ceremony-burst ${phase === 'done' ? 'fade' : ''}`}
            src={UI_ASSETS.overlays.packBurst}
            alt=""
            aria-hidden="true"
          />
        )}

        {showFan && (
          <ul className="pack-ceremony-fan" role="list">
            {cards.map((card, index) => {
              const meta = CARD_LIBRARY.find((entry) => entry.id === card.id)
              const total = cards.length
              const midpoint = (total - 1) / 2
              const tilt = (index - midpoint) * 8
              const lift = Math.abs(index - midpoint) * 6
              const isFlipped = flipped[index]
              const isLegendary = card.rarity.toLowerCase() === 'legendary'
              const isFirstTime = firstTimeMap[index]
              const cardClass = [
                'pack-ceremony-card',
                `rarity-${card.rarity}`,
                isFlipped ? 'flipped' : '',
                isFirstTime ? 'is-new' : '',
                isLegendary && isFlipped ? 'legendary-flipped' : '',
              ].filter(Boolean).join(' ')
              const style = {
                '--ceremony-tilt': `${tilt}deg`,
                '--ceremony-lift': `${lift}px`,
                '--ceremony-index': index,
                '--rarity-color': RARITY_COLORS[card.rarity as keyof typeof RARITY_COLORS] ?? '#cbd5e1',
              } as React.CSSProperties

              return (
                <li key={`${card.id}-${index}`} className="pack-ceremony-fan-slot" style={style}>
                  <button
                    type="button"
                    className={cardClass}
                    onClick={() => handleFlipCard(index)}
                    aria-label={isFlipped ? `${meta?.name ?? card.id}, ${card.rarity}` : `Reveal card ${index + 1}`}
                    aria-pressed={isFlipped}
                  >
                    <span className="pack-ceremony-card-inner">
                      <span className="pack-ceremony-card-back" aria-hidden="true">
                        <img
                          src={getPackArtPath(packId)}
                          alt=""
                          draggable={false}
                        />
                      </span>
                      <span className="pack-ceremony-card-front">
                        <img
                          className={`pack-ceremony-card-glow glow-${card.rarity}`}
                          src={UI_ASSETS.glows[card.rarity as keyof typeof UI_ASSETS.glows] ?? UI_ASSETS.glows.common}
                          alt=""
                          aria-hidden="true"
                        />
                        <span className="pack-ceremony-card-art">
                          <img
                            src={cardArtPath(card.id)}
                            alt={`${meta?.name ?? card.id} illustration`}
                            onError={handleCardArtError}
                            draggable={false}
                          />
                        </span>
                        <span className="pack-ceremony-card-meta">
                          <RarityBadge rarity={card.rarity} />
                          <strong>{meta?.icon ?? '🃏'} {meta?.name ?? card.id}</strong>
                          <span className="mini-text">
                            {card.duplicate ? 'Duplicate · refunded as Shards' : 'Added to your library'}
                          </span>
                        </span>
                        {isFirstTime && (
                          <img
                            className="pack-ceremony-card-ribbon"
                            src={UI_ASSETS.overlays.ribbonNew}
                            alt="New card"
                          />
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <footer className="pack-ceremony-footer">
          {!reducedMotion && !showFan && (
            <button type="button" className="ghost" onClick={handleSkipToReveal}>
              Skip Intro
            </button>
          )}
          {!allFlipped && (showFan) && (
            <button type="button" className="ghost" onClick={handleRevealAll}>
              Reveal All
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={onOpenAnother}
            disabled={!allFlipped || !canOpenAnother}
          >
            {packOpening ? 'Opening…' : `Open Another (${packCost} Shards)`}
          </button>
          <button
            type="button"
            className="primary"
            onClick={onClose}
            disabled={!allFlipped}
          >
            Done
          </button>
        </footer>
      </div>
    </section>
  )
}
