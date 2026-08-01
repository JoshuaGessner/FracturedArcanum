import React from 'react'
import { ARENA_URL, CARD_ART_ALIASES, EFFECT_ICONS, PACK_ART, RANK_INSIGNIA, RARITY_GEM_ICONS } from './constants'
import type { AppScreen, ToastSeverity } from './types'

export type RewardScope = 'battle' | 'pack' | 'daily' | 'rank' | 'generic'
export type InstallAvailability = 'prompt' | 'ios-manual' | 'installed' | 'unavailable'

export function isAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const ua = navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

export function getInstallAvailability(hasInstallPrompt: boolean): InstallAvailability {
  if (isStandaloneMode()) {
    return 'installed'
  }

  if (hasInstallPrompt) {
    return 'prompt'
  }

  if (isAppleMobileDevice()) {
    return 'ios-manual'
  }

  return 'unavailable'
}

export function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    return rawValue ? (JSON.parse(rawValue) as T) : fallback
  } catch {
    return fallback
  }
}

export function createAnonymousId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `guest-${crypto.randomUUID().slice(0, 12)}`
  }

  return `guest-${Math.random().toString(36).slice(2, 14)}`
}

export function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? '',
  ]
  return parts.join('|')
}

type PasskeyOriginLocation = {
  hostname: string
  protocol: string
  port?: string
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
}

function isIpv4Hostname(hostname: string): boolean {
  const octets = hostname.split('.')
  return octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
}

function isIpHostname(hostname: string): boolean {
  return isIpv4Hostname(hostname) || hostname.includes(':')
}

function isLocalIpHostname(hostname: string): boolean {
  return hostname === '0.0.0.0' || hostname === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
}

export function getPasskeyOriginRequirementMessage(locationOverride?: PasskeyOriginLocation): string {
  const currentLocation = locationOverride ?? (typeof window === 'undefined' ? null : window.location)
  if (!currentLocation) {
    return ''
  }

  const hostname = normalizeHostname(currentLocation.hostname)
  if (!isIpHostname(hostname)) {
    return ''
  }

  if (isLocalIpHostname(hostname)) {
    const protocol = currentLocation.protocol || 'http:'
    const port = currentLocation.port ? `:${currentLocation.port}` : ''
    return `Local passkey testing must use ${protocol}//localhost${port} instead of ${currentLocation.hostname}.`
  }

  return 'Passkeys require a domain name. Open Fractured Arcanum from its configured domain instead of an IP address.'
}

export function formatPasskeyCeremonyError(error: unknown, fallbackMessage: string, cancelledMessage = 'Passkey prompt was cancelled.'): string {
  if (error instanceof Error && error.name === 'NotAllowedError') {
    return cancelledMessage
  }

  if (error instanceof Error && error.name === 'SecurityError') {
    return 'Passkey prompt is blocked because the app domain does not match the passkey domain. Open the canonical app URL and check passkey server configuration.'
  }

  if (error instanceof Error && error.name === 'PasskeyTimeoutError') {
    return error.message
  }

  return getPasskeyOriginRequirementMessage() || fallbackMessage
}

export async function authFetch(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(`${ARENA_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  return response
}

export function getScreenBucket(): string {
  if (typeof window === 'undefined') {
    return 'unknown'
  }

  if (window.innerWidth < 700) {
    return 'mobile'
  }

  if (window.innerWidth < 1100) {
    return 'tablet'
  }

  return 'desktop'
}

export function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function cardArtPath(cardId: string): string {
  const mappedCardId = CARD_ART_ALIASES[cardId] ?? cardId
  return `/generated/cards/${mappedCardId}.svg`
}

export function handleCardArtError(event: React.SyntheticEvent<HTMLImageElement>): void {
  const fallbackPath = '/generated/cards/mana-wisp.svg'
  if (event.currentTarget.src.endsWith(fallbackPath)) {
    return
  }
  event.currentTarget.src = fallbackPath
}

export function pulseFeedback(duration = 14, enabled = true): void {
  if (enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(duration)
  }
}

export function makeLobbyCode(): string {
  return `RUNE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

/**
 * The rank ladder, in ascending order.
 *
 * These thresholds used to be written twice: once as the label ladder in this
 * function, once as a `previousRankTarget`/`nextRankTarget` ternary chain in
 * AppShell that drove the progress bar. The two agreed, but nothing made them
 * agree — adding a tier meant remembering both, and a mismatch would have shown
 * up as a bar filling against the wrong band.
 *
 * The first `floor` and the last `ceiling` are the ends of the bar, not limits
 * on the rating itself.
 */
const RANK_BANDS = [
  { label: 'Bronze', floor: 1000, ceiling: 1150 },
  { label: 'Silver', floor: 1150, ceiling: 1300 },
  { label: 'Gold', floor: 1300, ceiling: 1500 },
  { label: 'Diamond', floor: 1500, ceiling: 1700 },
] as const

export type RankBand = {
  label: string
  /** Rating at which this band starts — 0% on the bar. */
  floor: number
  /** Rating at which the next band starts — 100% on the bar. */
  ceiling: number
  /** Position within the band, clamped to 0–100. */
  progress: number
}

export function getRankBand(rating: number): RankBand {
  const band = RANK_BANDS.reduce((best, candidate) => (rating >= candidate.floor ? candidate : best), RANK_BANDS[0])
  const progress = Math.max(0, Math.min(100, Math.round(((rating - band.floor) / (band.ceiling - band.floor)) * 100)))
  return { label: band.label, floor: band.floor, ceiling: band.ceiling, progress }
}

export function getRankLabel(rating: number): string {
  return getRankBand(rating).label
}

export function getRankAssetPath(rankOrRating: string | number): string {
  const rankLabel = typeof rankOrRating === 'number' ? getRankLabel(rankOrRating) : rankOrRating
  switch (rankLabel.toLowerCase()) {
    case 'diamond':
      return RANK_INSIGNIA.diamond
    case 'gold':
      return RANK_INSIGNIA.gold
    case 'silver':
      return RANK_INSIGNIA.silver
    default:
      return RANK_INSIGNIA.bronze
  }
}

export function getPackArtPath(packId: string): string {
  switch (packId.toLowerCase()) {
    case 'premium':
      return PACK_ART.premium
    case 'legendary':
      return PACK_ART.legendary
    default:
      return PACK_ART.standard
  }
}

export function getRarityGemPath(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'rare':
      return RARITY_GEM_ICONS.rare
    case 'epic':
      return RARITY_GEM_ICONS.epic
    case 'legendary':
      return RARITY_GEM_ICONS.legendary
    default:
      return RARITY_GEM_ICONS.common
  }
}

export function getEffectIconPath(effect: string | null | undefined): string | null {
  if (!effect) {
    return null
  }

  return EFFECT_ICONS[effect as keyof typeof EFFECT_ICONS] ?? null
}

export function getScreenTransitionClass(fromScreen: AppScreen, toScreen: AppScreen): 'screen-enter-forward' | 'screen-enter-back' | 'screen-enter-lateral' | 'screen-enter-battle' {
  if (toScreen === 'battle') {
    return 'screen-enter-battle'
  }

  if (fromScreen === 'battle' || toScreen === 'home') {
    return 'screen-enter-back'
  }

  if (fromScreen === 'home') {
    return 'screen-enter-forward'
  }

  const orderedScreens: AppScreen[] = ['home', 'collection', 'shop', 'social', 'settings']
  const fromIndex = orderedScreens.indexOf(fromScreen)
  const toIndex = orderedScreens.indexOf(toScreen)

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return 'screen-enter-lateral'
  }

  return toIndex > fromIndex ? 'screen-enter-forward' : 'screen-enter-back'
}

export function getScreenTransitionSound(
  fromScreen: AppScreen,
  toScreen: AppScreen,
): 'sceneOpen' | 'sceneClose' | 'runeWipe' | 'portalSlam' {
  const transitionClass = getScreenTransitionClass(fromScreen, toScreen)
  switch (transitionClass) {
    case 'screen-enter-battle':
      return 'portalSlam'
    case 'screen-enter-back':
      return 'sceneClose'
    case 'screen-enter-lateral':
      return 'runeWipe'
    case 'screen-enter-forward':
    default:
      return 'sceneOpen'
  }
}

export function shouldPresentScopedReward(scope: RewardScope, activeScreen: AppScreen): boolean {
  switch (scope) {
    case 'battle':
      return activeScreen === 'battle'
    case 'pack':
      return activeScreen === 'shop'
    case 'daily':
      return activeScreen === 'home' || activeScreen === 'shop'
    case 'rank':
      return activeScreen === 'battle' || activeScreen === 'home'
    case 'generic':
    default:
      return true
  }
}

export function getCompletionPercent(current: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
}

export function getRarityCompletion(
  collection: Record<string, number>,
  library: { id: string; rarity: string }[],
): Record<string, { owned: number; total: number }> {
  const result: Record<string, { owned: number; total: number }> = {}
  for (const card of library) {
    if (!result[card.rarity]) result[card.rarity] = { owned: 0, total: 0 }
    result[card.rarity].total++
    if ((collection[card.id] ?? 0) > 0) result[card.rarity].owned++
  }
  return result
}

export function getComplaintSeverityTone(severity: string): 'severity-low' | 'severity-normal' | 'severity-high' | 'severity-urgent' {
  switch (severity.toLowerCase()) {
    case 'low':
      return 'severity-low'
    case 'high':
      return 'severity-high'
    case 'urgent':
      return 'severity-urgent'
    default:
      return 'severity-normal'
  }
}

export function getStreakTier(streak: number): 'calm' | 'ember' | 'inferno' {
  if (streak >= 5) {
    return 'inferno'
  }

  if (streak >= 3) {
    return 'ember'
  }

  return 'calm'
}

export function getHandFanTilt(index: number, total: number): number {
  if (total <= 1) {
    return 0
  }

  const midpoint = (total - 1) / 2
  return Math.round((index - midpoint) * 4)
}

export function inferToastSeverity(text: string): ToastSeverity {
  const lc = text.toLowerCase()
  if (/(error|fail|could not|cannot|denied|invalid|wrong|disconnect|lost|revok|too short|too long|already|forbid|unavailable|not enough)/.test(lc))
    return 'error'
  if (/(warning|caution|expired|reconnect|waiting|slow|delay)/.test(lc)) return 'warning'
  if (/(welcome|claimed|unlocked|equipped|victory|won|saved|added|matched|ready|reconnected|installed|now an admin|server owner)/.test(lc))
    return 'success'
  return 'info'
}

export function getCardName(cardId: string, library: Array<{ id: string; name: string }>): string {
  const card = library.find((entry) => entry.id === cardId)
  return card ? card.name : cardId
}

export function getCardIcon(cardId: string, library: Array<{ id: string; icon: string }>): string {
  const card = library.find((entry) => entry.id === cardId)
  return card?.icon ?? '🃏'
}
