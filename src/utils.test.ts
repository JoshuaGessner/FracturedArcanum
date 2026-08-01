import { describe, expect, it } from 'vitest'
import { formatPasskeyCeremonyError, getCompletionPercent, getComplaintSeverityTone, getEffectIconPath, getHandFanTilt, getPackArtPath, getPasskeyOriginRequirementMessage, getRankAssetPath, getRankBand, getRankLabel, getRarityCompletion, getRarityGemPath, getScreenTransitionClass, getScreenTransitionSound, getStreakTier, shouldPresentScopedReward } from './utils'

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
    expect(getScreenTransitionClass('home', 'collection')).toBe('screen-enter-forward')
    expect(getScreenTransitionClass('shop', 'home')).toBe('screen-enter-back')
    expect(getScreenTransitionClass('shop', 'social')).toBe('screen-enter-forward')
    expect(getScreenTransitionClass('collection', 'battle')).toBe('screen-enter-battle')
  })

  it('maps each transition direction to a paired sound cue', () => {
    expect(getScreenTransitionSound('home', 'collection')).toBe('sceneOpen')
    expect(getScreenTransitionSound('shop', 'home')).toBe('sceneClose')
    expect(getScreenTransitionSound('shop', 'social')).toBe('sceneOpen')
    expect(getScreenTransitionSound('social', 'shop')).toBe('sceneClose')
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

  it('warns when local passkey testing uses an IP host', () => {
    expect(getPasskeyOriginRequirementMessage({ hostname: '127.0.0.1', protocol: 'http:', port: '5173' }))
      .toBe('Local passkey testing must use http://localhost:5173 instead of 127.0.0.1.')
    expect(getPasskeyOriginRequirementMessage({ hostname: '[::1]', protocol: 'http:', port: '5173' }))
      .toBe('Local passkey testing must use http://localhost:5173 instead of [::1].')
  })

  it('requires a domain name for non-local IP passkey origins', () => {
    expect(getPasskeyOriginRequirementMessage({ hostname: 'localhost', protocol: 'http:', port: '5173' })).toBe('')
    expect(getPasskeyOriginRequirementMessage({ hostname: 'farcanum.anomalousinteractive.com', protocol: 'https:' })).toBe('')
    expect(getPasskeyOriginRequirementMessage({ hostname: '192.168.1.10', protocol: 'http:', port: '5173' }))
      .toBe('Passkeys require a domain name. Open Fractured Arcanum from its configured domain instead of an IP address.')
  })

  it('formats passkey ceremony errors without hiding user cancellation', () => {
    const cancelled = new DOMException('The operation was cancelled.', 'NotAllowedError')
    const securityError = new DOMException('The relying party ID is not valid.', 'SecurityError')
    const timedOut = new Error('Passkey prompt timed out.')
    timedOut.name = 'PasskeyTimeoutError'
    expect(formatPasskeyCeremonyError(cancelled, 'Passkey login failed.')).toBe('Passkey prompt was cancelled.')
    expect(formatPasskeyCeremonyError(securityError, 'Passkey login failed.')).toBe('Passkey prompt is blocked because the app domain does not match the passkey domain. Open the canonical app URL and check passkey server configuration.')
    expect(formatPasskeyCeremonyError(timedOut, 'Passkey login failed.')).toBe('Passkey prompt timed out.')
    expect(formatPasskeyCeremonyError(new Error('Unknown local failure'), 'Passkey login failed.')).toBe('Passkey login failed.')
  })
})

/**
 * The rank ladder is the one place the tier thresholds are written. It used to
 * be two places — the label chain inside `getRankLabel` and a
 * `previousRankTarget`/`nextRankTarget` ternary in AppShell that drove the
 * progress bar — which is a mismatch waiting to happen the next time a tier
 * moves.
 */
describe('getRankBand', () => {
  it('names each tier at its own floor', () => {
    expect(getRankBand(1000).label).toBe('Bronze')
    expect(getRankBand(1150).label).toBe('Silver')
    expect(getRankBand(1300).label).toBe('Gold')
    expect(getRankBand(1500).label).toBe('Diamond')
  })

  it('promotes on the threshold, not one point past it', () => {
    expect(getRankBand(1149).label).toBe('Bronze')
    expect(getRankBand(1299).label).toBe('Silver')
    expect(getRankBand(1499).label).toBe('Gold')
  })

  /**
   * Bands are half-open: the ceiling belongs to the next tier. A player who
   * hits 1300 is Gold at 0%, never Silver at 100% — the bar resets as the
   * label changes, which is what the promotion should look like.
   */
  it('starts each band at 0% and approaches, without reaching, its ceiling', () => {
    expect(getRankBand(1150).progress).toBe(0)
    expect(getRankBand(1299).progress).toBe(99)
    expect(getRankBand(1300)).toMatchObject({ label: 'Gold', progress: 0 })
  })

  it('measures progress against the band the rating is actually in', () => {
    // 60 of the 150 points between Silver's 1150 and Gold's 1300.
    expect(getRankBand(1210).progress).toBe(40)
    // 100 of the 200 between Gold's 1300 and Diamond's 1500.
    expect(getRankBand(1400).progress).toBe(50)
  })

  it('points at the next tier, so the bar and the label agree', () => {
    expect(getRankBand(1210).ceiling).toBe(1300)
    expect(getRankBand(1400).ceiling).toBe(1500)
  })

  /**
   * Below the ladder the old arithmetic went negative, and two components
   * clamped it independently on the way to the bar. Clamping at the source
   * means neither has to.
   */
  it('clamps a rating under the ladder to zero rather than going negative', () => {
    expect(getRankBand(900).progress).toBe(0)
    expect(getRankBand(0).progress).toBe(0)
  })

  it('clamps a rating past the top of the ladder to full', () => {
    expect(getRankBand(1700).label).toBe('Diamond')
    expect(getRankBand(2400).progress).toBe(100)
  })
})

describe('getRankLabel', () => {
  it('is the band label and nothing else', () => {
    for (const rating of [0, 999, 1000, 1149, 1150, 1299, 1300, 1499, 1500, 2400]) {
      expect(getRankLabel(rating)).toBe(getRankBand(rating).label)
    }
  })
})
