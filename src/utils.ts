import React from 'react'
import { ARENA_URL, CARD_ART_ALIASES } from './constants'
import type { ToastSeverity } from './types'

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

export function shouldShowIosInstallHelp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const nav = navigator as Navigator & { standalone?: boolean }
  // iOS Safari still requires manual install (Share → Add to Home Screen) and
  // does not expose a reliable capability API equivalent to beforeinstallprompt.
  const isIosDevice =
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true

  return isIosDevice && !isStandalone
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
