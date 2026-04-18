import React from 'react'
import { ARENA_URL, CARD_ART_ALIASES, EFFECT_ICONS, PACK_ART, RANK_INSIGNIA, RARITY_GEM_ICONS } from './constants'
import type { AppScreen, ToastSeverity } from './types'

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

export function pulseFeedback(duration = 14): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(duration)
  }
}

export function makeLobbyCode(): string {
  return `RUNE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export function getRankLabel(rating: number): string {
  if (rating >= 1500) {
    return 'Diamond'
  }

  if (rating >= 1300) {
    return 'Gold'
  }

  if (rating >= 1150) {
    return 'Silver'
  }

  return 'Bronze'
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

  const orderedScreens: AppScreen[] = ['home', 'play', 'collection', 'social', 'shop', 'settings']
  const fromIndex = orderedScreens.indexOf(fromScreen)
  const toIndex = orderedScreens.indexOf(toScreen)

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return 'screen-enter-lateral'
  }

  return toIndex > fromIndex ? 'screen-enter-forward' : 'screen-enter-back'
}

export function getCompletionPercent(current: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
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
