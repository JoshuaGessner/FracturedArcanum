import { describe, expect, it } from 'vitest'
import { getCompletionPercent, getComplaintSeverityTone, getEffectIconPath, getHandFanTilt, getPackArtPath, getRankAssetPath, getRarityCompletion, getRarityGemPath, getScreenTransitionClass, getScreenTransitionSound, getStreakTier, shouldPresentScopedReward } from './utils'

describe('UI asset helpers', () => {
  it('resolves rank insignia from labels and ratings', () => {
    expect(getRankAssetPath('Gold')).toContain('rank-gold.svg')
    expect(getRankAssetPath(1525)).toContain('rank-diamond.svg')
    expect(getRankAssetPath(1180)).toContain('rank-silver.svg')
  })

  it('falls back to safe defaults for pack art and effect icons', () => {
    expect(getPackArtPath('premium')).toContain('pack-premium.svg')
    expect(getPackArtPath('unknown-pack')).toContain('pack-standard.svg')
    expect(getEffectIconPath('charge')).toContain('fx-charge.svg')
    expect(getEffectIconPath('missing-effect')).toBeNull()
  })

  it('maps rarity names to generated gem assets', () => {
    expect(getRarityGemPath('common')).toContain('gem-common.svg')
    expect(getRarityGemPath('legendary')).toContain('gem-legendary.svg')
    expect(getRarityGemPath('mystery')).toContain('gem-common.svg')
  })

  it('derives transition classes for app navigation', () => {
    expect(getScreenTransitionClass('home', 'play')).toBe('screen-enter-forward')
    expect(getScreenTransitionClass('shop', 'home')).toBe('screen-enter-back')
    expect(getScreenTransitionClass('social', 'shop')).toBe('screen-enter-forward')
    expect(getScreenTransitionClass('collection', 'battle')).toBe('screen-enter-battle')
  })

  it('maps each transition direction to a paired sound cue', () => {
    expect(getScreenTransitionSound('home', 'play')).toBe('sceneOpen')
    expect(getScreenTransitionSound('shop', 'home')).toBe('sceneClose')
    expect(getScreenTransitionSound('social', 'shop')).toBe('sceneOpen')
    expect(getScreenTransitionSound('shop', 'social')).toBe('sceneClose')
    expect(getScreenTransitionSound('settings', 'settings')).toBe('runeWipe')
    expect(getScreenTransitionSound('collection', 'battle')).toBe('portalSlam')
  })

  it('clamps collection completion percentages safely', () => {
    expect(getCompletionPercent(21, 70)).toBe(30)
    expect(getCompletionPercent(80, 70)).toBe(100)
    expect(getCompletionPercent(5, 0)).toBe(0)
  })

  it('derives owned-vs-total counts per rarity bucket', () => {
    const result = getRarityCompletion(
      { a: 1, b: 0, c: 2 },
      [
        { id: 'a', rarity: 'common' },
        { id: 'b', rarity: 'common' },
        { id: 'c', rarity: 'rare' },
      ],
    )

    expect(result.common).toEqual({ owned: 1, total: 2 })
    expect(result.rare).toEqual({ owned: 1, total: 1 })
  })

  it('maps complaint severities to stable UI tones', () => {
    expect(getComplaintSeverityTone('low')).toBe('severity-low')
    expect(getComplaintSeverityTone('high')).toBe('severity-high')
    expect(getComplaintSeverityTone('urgent')).toBe('severity-urgent')
    expect(getComplaintSeverityTone('unknown')).toBe('severity-normal')
  })

  it('categorizes streak tiers for reward presentation', () => {
    expect(getStreakTier(0)).toBe('calm')
    expect(getStreakTier(3)).toBe('ember')
    expect(getStreakTier(6)).toBe('inferno')
  })

  it('derives balanced hand fan tilt values', () => {
    expect(getHandFanTilt(0, 1)).toBe(0)
    expect(getHandFanTilt(0, 5)).toBe(-8)
    expect(getHandFanTilt(2, 5)).toBe(0)
    expect(getHandFanTilt(4, 5)).toBe(8)
  })

  it('scopes reward flows to the screen they belong to', () => {
    expect(shouldPresentScopedReward('battle', 'battle')).toBe(true)
    expect(shouldPresentScopedReward('battle', 'settings')).toBe(false)
    expect(shouldPresentScopedReward('pack', 'shop')).toBe(true)
    expect(shouldPresentScopedReward('pack', 'home')).toBe(false)
    expect(shouldPresentScopedReward('daily', 'home')).toBe(true)
  })
})
