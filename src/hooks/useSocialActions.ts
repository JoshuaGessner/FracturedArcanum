import { useCallback, useEffect } from 'react'
import type { FormEvent, MutableRefObject } from 'react'
import type { Socket } from 'socket.io-client'
import { authFetch } from '../utils'
import { useSocialState } from '../contexts/SocialProvider'
import { useProfileState } from '../contexts/ProfileProvider'
import type { SocialClan, SocialFriend, Trade } from '../types'

/**
 * Friends, challenges, trading, and clans — every action the social hub can
 * take.
 *
 * Extracted from `AppShell`. This cluster reads its own state through
 * `useSocialState()` rather than receiving ~16 setters as parameters, which is
 * what keeps the dependency surface to the handful below. `setCollection`
 * comes from ProfileProvider because accepting a trade mutates the card
 * collection.
 *
 * The state itself stays in SocialProvider; only the actions live here.
 */
export type SocialActionsDeps = {
  authToken: string
  loggedIn: boolean
  /** Trades and challenges are gated on having a legal deck. */
  deckReady: boolean
  refreshSocialHub: () => Promise<void>
  setToastMessage: (message: string) => void
  socketClientRef: MutableRefObject<Socket | null>
}

export function useSocialActions({
  authToken,
  loggedIn,
  deckReady,
  refreshSocialHub,
  setToastMessage,
  socketClientRef,
}: SocialActionsDeps) {
  const {
    setFriends,
    outgoingChallenge,
    setOutgoingChallenge,
    incomingChallenge,
    setIncomingChallenge,
    setChallengeStatus,
    setTrades,
    tradesTick,
    setTradeStatus,
    tradeForm,
    setTradeForm,
    tradePickerDraft,
    setTradePickerDraft,
    tradeSubmitting,
    setTradeSubmitting,
    nowTick,
    setClan,
    setSocialLoading,
    setSocialStatus,
    friendUsernameInput,
    setFriendUsernameInput,
    clanForm,
    setClanForm,
  } = useSocialState()
  const { deckConfig, setCollection } = useProfileState()

  async function handleAddFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken) {
      return
    }

    const username = friendUsernameInput.trim()
    if (!username) {
      setToastMessage('Enter a username to add a friend.')
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/friends', authToken, { method: 'POST', body: { username } })
      const data = (await response.json()) as { ok?: boolean; error?: string; alreadyFriend?: boolean; social?: { friends?: SocialFriend[]; clan?: SocialClan | null } }
      if (!response.ok || !data.ok) {
        setToastMessage(data.error ?? 'Could not add friend right now.')
        return
      }
      if (data.social) {
        setFriends(data.social.friends ?? [])
        setClan(data.social.clan ?? null)
      }
      setFriendUsernameInput('')
      setToastMessage(data.alreadyFriend ? 'Friend list refreshed.' : `Friend added: @${username}.`)
      await refreshSocialHub()
    } catch {
      setToastMessage('Could not add friend right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleRemoveFriend(friendAccountId: string, displayName: string) {
    if (!authToken) {
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch(`/api/social/friends/${friendAccountId}`, authToken, { method: 'DELETE' })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setToastMessage(data.error ?? 'Could not remove friend right now.')
        return
      }
      setToastMessage(`${displayName} removed from your friends list.`)
      await refreshSocialHub()
    } catch {
      setToastMessage('Could not remove friend right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  function handleChallengeFriend(friend: SocialFriend) {
    const socket = socketClientRef.current
    if (!socket?.connected) {
      setChallengeStatus('Not connected to arena server.')
      return
    }
    if (!deckReady) {
      setChallengeStatus('Finish your deck before challenging friends.')
      return
    }
    if (outgoingChallenge) {
      setChallengeStatus('Cancel your pending challenge first.')
      return
    }
    setChallengeStatus(`Inviting ${friend.displayName}…`)
    socket.emit('challenge:send', {
      targetAccountId: friend.accountId,
      deckConfig,
    })
  }

  function handleAcceptChallenge() {
    const socket = socketClientRef.current
    if (!socket?.connected || !incomingChallenge) return
    if (!deckReady) {
      setChallengeStatus('Build a deck before accepting challenges.')
      return
    }
    socket.emit('challenge:accept', {
      challengeId: incomingChallenge.challengeId,
      deckConfig,
    })
  }

  function handleDeclineChallenge() {
    const socket = socketClientRef.current
    if (!socket?.connected || !incomingChallenge) return
    socket.emit('challenge:decline', { challengeId: incomingChallenge.challengeId })
    setIncomingChallenge(null)
  }

  function handleCancelOutgoingChallenge() {
    const socket = socketClientRef.current
    if (!socket?.connected || !outgoingChallenge) return
    socket.emit('challenge:cancel', { challengeId: outgoingChallenge.challengeId })
    setOutgoingChallenge(null)
  }

  // ─── Trading ──────────────────────────────────────────────────────

  const refreshTrades = useCallback(async () => {
    if (!authToken) return
    try {
      const response = await authFetch('/api/trades', authToken)
      if (!response.ok) return
      const data = (await response.json()) as { ok: boolean; trades: Trade[] }
      setTrades(data.trades ?? [])
    } catch {
      /* non-fatal */
    }
    // setTrades comes from SocialProvider's useState; stable but eslint
    // can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  // Fetch trades whenever a trade event bumps the tick (login, trade:incoming,
  // trade:updated). This is a plain "subscribe to external event" effect.
  useEffect(() => {
    if (!loggedIn) return
    void refreshTrades()
  }, [loggedIn, tradesTick, refreshTrades])

  async function handleProposeTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken || tradeSubmitting) return
    const toAccountId = tradeForm.toAccountId.trim()
    if (!toAccountId) {
      setTradeStatus('Choose a friend to trade with.')
      return
    }
    if (!tradeForm.offer.length || !tradeForm.request.length) {
      setTradeStatus('Add at least one card to each side of the trade.')
      return
    }
    setTradeSubmitting(true)
    try {
      const response = await authFetch('/api/trades/propose', authToken, {
        method: 'POST',
        body: { toAccountId, offer: tradeForm.offer, request: tradeForm.request },
      })
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setTradeStatus(data.error ?? 'Could not propose trade.')
        return
      }
      setTradeStatus('Trade proposal sent.')
      setTradeForm({ toAccountId: '', offer: [], request: [] })
      setTradePickerDraft({ side: 'offer', cardId: '', qty: 1 })
      await refreshTrades()
    } catch {
      setTradeStatus('Could not reach server.')
    } finally {
      setTradeSubmitting(false)
    }
  }

  function addTradeChip() {
    const cardId = tradePickerDraft.cardId
    if (!cardId) return
    const qty = Math.max(1, Math.min(3, tradePickerDraft.qty || 1))
    const sideKey = tradePickerDraft.side
    setTradeForm((current) => {
      const sideItems = current[sideKey]
      if (sideItems.length >= 6 && !sideItems.some((item) => item.cardId === cardId)) {
        setTradeStatus('Each side can include at most 6 distinct cards.')
        return current
      }
      const nextItems = [...sideItems]
      const existingIndex = nextItems.findIndex((item) => item.cardId === cardId)
      if (existingIndex >= 0) {
        nextItems[existingIndex] = { cardId, qty: Math.min(3, nextItems[existingIndex].qty + qty) }
      } else {
        nextItems.push({ cardId, qty })
      }
      return { ...current, [sideKey]: nextItems }
    })
    setTradePickerDraft((current) => ({ ...current, cardId: '', qty: 1 }))
  }

  function removeTradeChip(side: 'offer' | 'request', cardId: string) {
    setTradeForm((current) => ({
      ...current,
      [side]: current[side].filter((item) => item.cardId !== cardId),
    }))
  }

  function formatCountdown(targetMs: number): string {
    const remaining = Math.max(0, targetMs - nowTick)
    if (remaining <= 0) return 'expired'
    const totalSec = Math.floor(remaining / 1000)
    if (totalSec >= 86400) {
      const d = Math.floor(totalSec / 86400)
      const h = Math.floor((totalSec % 86400) / 3600)
      return `${d}d ${h}h`
    }
    if (totalSec >= 3600) {
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      return `${h}h ${m}m`
    }
    if (totalSec >= 60) {
      const m = Math.floor(totalSec / 60)
      const s = totalSec % 60
      return `${m}m ${s.toString().padStart(2, '0')}s`
    }
    return `${totalSec}s`
  }


  async function handleTradeAction(tradeId: string, action: 'accept' | 'reject' | 'cancel') {
    if (!authToken) return
    try {
      const response = await authFetch(`/api/trades/${encodeURIComponent(tradeId)}/${action}`, authToken, {
        method: 'POST',
      })
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setTradeStatus(data.error ?? `Could not ${action} trade.`)
        return
      }
      if (action === 'accept') setTradeStatus('Trade accepted — cards transferred.')
      else if (action === 'reject') setTradeStatus('Trade rejected.')
      else setTradeStatus('Trade cancelled.')
      await refreshTrades()
      if (action === 'accept') {
        // Collection changed; refresh it.
        try {
          const collectionResponse = await authFetch('/api/collection', authToken)
          if (collectionResponse.ok) {
            const collectionData = (await collectionResponse.json()) as { ok: boolean; collection?: Record<string, number> }
            if (collectionData.ok && collectionData.collection) {
              setCollection(collectionData.collection)
            }
          }
        } catch { /* non-fatal */ }
      }
    } catch {
      setTradeStatus('Could not reach server.')
    }
  }

  async function handleCreateClan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken) {
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/clan/create', authToken, {
        method: 'POST',
        body: { name: clanForm.name, tag: clanForm.tag },
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setSocialStatus(data.error ?? 'Could not create clan right now.')
        return
      }
      setClanForm((current) => ({ ...current, name: '', tag: '' }))
      setSocialStatus('Clan created successfully.')
      await refreshSocialHub()
    } catch {
      setSocialStatus('Could not create clan right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleJoinClan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken) {
      return
    }

    const inviteCode = clanForm.inviteCode.trim().toUpperCase()
    if (!inviteCode) {
      setSocialStatus('Enter a clan invite code to join.')
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/clan/join', authToken, { method: 'POST', body: { inviteCode } })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setSocialStatus(data.error ?? 'Could not join clan right now.')
        return
      }
      setClanForm((current) => ({ ...current, inviteCode: '' }))
      setSocialStatus(`Joined clan via ${inviteCode}.`)
      await refreshSocialHub()
    } catch {
      setSocialStatus('Could not join clan right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleLeaveClan() {
    if (!authToken) {
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/clan/leave', authToken, { method: 'POST' })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setSocialStatus(data.error ?? 'Could not leave clan right now.')
        return
      }
      setSocialStatus('You left your clan.')
      await refreshSocialHub()
    } catch {
      setSocialStatus('Could not leave clan right now.')
    } finally {
      setSocialLoading(false)
    }
  }


  return {
    handleAddFriend,
    handleRemoveFriend,
    handleChallengeFriend,
    handleAcceptChallenge,
    handleDeclineChallenge,
    handleCancelOutgoingChallenge,
    handleProposeTrade,
    handleTradeAction,
    addTradeChip,
    removeTradeChip,
    formatCountdown,
    handleCreateClan,
    handleJoinClan,
    handleLeaveClan,
  }
}

