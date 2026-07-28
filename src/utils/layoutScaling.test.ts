import { describe, expect, it } from 'vitest'
import { findScalingInversions, formatInversion, type ScalingSample } from './layoutScaling'

const TARGETS = [{ name: 'builder-card' }]

describe('findScalingInversions', () => {
  it('catches the deck-builder regression that motivated container queries', () => {
    // Measured from the running app before the migration. Crossing the 640px
    // breakpoint switched .builder-grid to two columns — making each card much
    // wider — while `@media (max-width: 640px)` simultaneously applied the
    // compact type scale meant for narrow cards.
    const before: ScalingSample[] = [
      { viewport: 393, components: { 'builder-card': { width: 172, fontSize: 12.48 } } },
      { viewport: 639, components: { 'builder-card': { width: 294, fontSize: 12.48 } } },
      { viewport: 641, components: { 'builder-card': { width: 190, fontSize: 16 } } },
      { viewport: 1440, components: { 'builder-card': { width: 217, fontSize: 16 } } },
    ]

    const inversions = findScalingInversions(before, TARGETS)

    expect(inversions).toHaveLength(1)
    expect(inversions[0].narrower.width).toBe(217)
    expect(inversions[0].narrower.fontSize).toBe(16)
    expect(inversions[0].wider.width).toBe(294)
    expect(inversions[0].wider.fontSize).toBe(12.48)
  })

  it('accepts the post-migration measurements', () => {
    // Same viewports, measured after the rules were keyed to the card's own
    // width. Type never shrinks as the box grows.
    const after: ScalingSample[] = [
      { viewport: 393, components: { 'builder-card': { width: 172, fontSize: 12.48 } } },
      { viewport: 639, components: { 'builder-card': { width: 194, fontSize: 12.48 } } },
      { viewport: 641, components: { 'builder-card': { width: 190, fontSize: 12.48 } } },
      { viewport: 1440, components: { 'builder-card': { width: 217, fontSize: 16 } } },
    ]

    expect(findScalingInversions(after, TARGETS)).toEqual([])
  })

  it('allows type to stay flat while the box grows', () => {
    const samples: ScalingSample[] = [
      { viewport: 400, components: { 'builder-card': { width: 150, fontSize: 14 } } },
      { viewport: 800, components: { 'builder-card': { width: 300, fontSize: 14 } } },
    ]

    expect(findScalingInversions(samples, TARGETS)).toEqual([])
  })

  it('ignores viewports where the component was not rendered', () => {
    const samples: ScalingSample[] = [
      { viewport: 400, components: {} },
      { viewport: 800, components: { 'builder-card': { width: 300, fontSize: 14 } } },
    ]

    expect(findScalingInversions(samples, TARGETS)).toEqual([])
  })

  it('compares by width rather than by viewport order', () => {
    // A narrower viewport can produce a wider card (fewer columns). Ordering by
    // viewport would miss this pair; ordering by width catches it.
    const samples: ScalingSample[] = [
      { viewport: 900, components: { 'builder-card': { width: 180, fontSize: 16 } } },
      { viewport: 500, components: { 'builder-card': { width: 260, fontSize: 12 } } },
    ]

    const inversions = findScalingInversions(samples, TARGETS)
    expect(inversions).toHaveLength(1)
    expect(inversions[0].narrower.viewport).toBe(900)
    expect(inversions[0].wider.viewport).toBe(500)
  })

  it('formats an inversion for the CLI', () => {
    const [inversion] = findScalingInversions(
      [
        { viewport: 641, components: { 'builder-card': { width: 190, fontSize: 16 } } },
        { viewport: 639, components: { 'builder-card': { width: 294, fontSize: 12.48 } } },
      ],
      TARGETS,
    )

    expect(formatInversion(inversion)).toBe(
      'builder-card: 190px box / 16px text (viewport 641)'
      + ' → 294px box / 12.48px text (viewport 639)'
      + ' — wider box, smaller text',
    )
  })
})
