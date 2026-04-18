import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type {
  IncomingChallenge,
  OutgoingChallenge,
  SocialClan,
  SocialFriend,
  Trade,
  TradeItem,
} from '../types'

/**
 * Phase 1E — real SocialContext.
 *
 * Owns friends/clan/challenges/trades state plus the 1Hz `nowTick` counter
 * used by countdown displays. Lives ABOVE `AppShell` in the React tree so
 * screens can read social state via `useSocial()` without going through the
 * AppContext mega-bag.
 *
 * Handlers (`handleAddFriend`, `handleChallengeFriend`, `handleProposeTrade`,
 * etc.) stay in `AppShell` because they need cross-cutting deps (authToken,
 * socketClientRef, setToastMessage, askConfirm, collection from
 * ProfileProvider, sendAnalytics). AppShell consumes the setters exposed by
 * `useSocialState()` to drive socket-driven state changes (trade:incoming,
 * trade:updated, challenge:matched, etc.) and form interactions.
 */

export type TradeForm = {
  toAccountId: string
  offer: TradeItem[]
  request: TradeItem[]
}

export type TradePickerDraft = {
  side: 'offer' | 'request'
  cardId: string
  qty: number
}

export type ClanForm = {
  name: string
  tag: string
  inviteCode: string
}

export type SocialStateValue = {
  friends: SocialFriend[]
  setFriends: Dispatch<SetStateAction<SocialFriend[]>>
  onlineFriendIds: Set<string>
  setOnlineFriendIds: Dispatch<SetStateAction<Set<string>>>
  outgoingChallenge: OutgoingChallenge | null
  setOutgoingChallenge: Dispatch<SetStateAction<OutgoingChallenge | null>>
  incomingChallenge: IncomingChallenge | null
  setIncomingChallenge: Dispatch<SetStateAction<IncomingChallenge | null>>
  challengeStatus: string
  setChallengeStatus: Dispatch<SetStateAction<string>>
  trades: Trade[]
  setTrades: Dispatch<SetStateAction<Trade[]>>
  tradesTick: number
  setTradesTick: Dispatch<SetStateAction<number>>
  tradeStatus: string
  setTradeStatus: Dispatch<SetStateAction<string>>
  tradeForm: TradeForm
  setTradeForm: Dispatch<SetStateAction<TradeForm>>
  tradePickerDraft: TradePickerDraft
  setTradePickerDraft: Dispatch<SetStateAction<TradePickerDraft>>
  tradeSubmitting: boolean
  setTradeSubmitting: Dispatch<SetStateAction<boolean>>
  nowTick: number
  clan: SocialClan | null
  setClan: Dispatch<SetStateAction<SocialClan | null>>
  socialLoading: boolean
  setSocialLoading: Dispatch<SetStateAction<boolean>>
  socialStatus: string
  setSocialStatus: Dispatch<SetStateAction<string>>
  friendUsernameInput: string
  setFriendUsernameInput: Dispatch<SetStateAction<string>>
  clanForm: ClanForm
  setClanForm: Dispatch<SetStateAction<ClanForm>>
}

const SocialContext = createContext<SocialStateValue | null>(null)

const INITIAL_TRADE_FORM: TradeForm = { toAccountId: '', offer: [], request: [] }
const INITIAL_TRADE_PICKER: TradePickerDraft = { side: 'offer', cardId: '', qty: 1 }
const INITIAL_CLAN_FORM: ClanForm = { name: '', tag: '', inviteCode: '' }
const INITIAL_SOCIAL_STATUS = 'Social hub ready.'

export function SocialProvider({ children }: { children: ReactNode }) {
  const [friends, setFriends] = useState<SocialFriend[]>([])
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(() => new Set())
  const [outgoingChallenge, setOutgoingChallenge] = useState<OutgoingChallenge | null>(null)
  const [incomingChallenge, setIncomingChallenge] = useState<IncomingChallenge | null>(null)
  const [challengeStatus, setChallengeStatus] = useState('')
  const [trades, setTrades] = useState<Trade[]>([])
  const [tradesTick, setTradesTick] = useState(0)
  const [tradeStatus, setTradeStatus] = useState('')
  const [tradeForm, setTradeForm] = useState<TradeForm>(INITIAL_TRADE_FORM)
  const [tradePickerDraft, setTradePickerDraft] = useState<TradePickerDraft>(INITIAL_TRADE_PICKER)
  const [tradeSubmitting, setTradeSubmitting] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [clan, setClan] = useState<SocialClan | null>(null)
  const [socialLoading, setSocialLoading] = useState(false)
  const [socialStatus, setSocialStatus] = useState(INITIAL_SOCIAL_STATUS)
  const [friendUsernameInput, setFriendUsernameInput] = useState('')
  const [clanForm, setClanForm] = useState<ClanForm>(INITIAL_CLAN_FORM)

  // 1Hz tick driving trade expiration countdowns and pending-challenge
  // displays. Self-contained — no external deps — so it lives in the
  // provider rather than AppShell.
  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const value = useMemo<SocialStateValue>(
    () => ({
      friends,
      setFriends,
      onlineFriendIds,
      setOnlineFriendIds,
      outgoingChallenge,
      setOutgoingChallenge,
      incomingChallenge,
      setIncomingChallenge,
      challengeStatus,
      setChallengeStatus,
      trades,
      setTrades,
      tradesTick,
      setTradesTick,
      tradeStatus,
      setTradeStatus,
      tradeForm,
      setTradeForm,
      tradePickerDraft,
      setTradePickerDraft,
      tradeSubmitting,
      setTradeSubmitting,
      nowTick,
      clan,
      setClan,
      socialLoading,
      setSocialLoading,
      socialStatus,
      setSocialStatus,
      friendUsernameInput,
      setFriendUsernameInput,
      clanForm,
      setClanForm,
    }),
    [
      friends,
      onlineFriendIds,
      outgoingChallenge,
      incomingChallenge,
      challengeStatus,
      trades,
      tradesTick,
      tradeStatus,
      tradeForm,
      tradePickerDraft,
      tradeSubmitting,
      nowTick,
      clan,
      socialLoading,
      socialStatus,
      friendUsernameInput,
      clanForm,
    ],
  )

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
}

/**
 * Internal hook used by `AppShell` to read state AND setters. Screens should
 * use `useSocial()` from `src/contexts/useSocial.ts` instead, which exposes
 * the readonly slice plus the action handlers from AppShell.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSocialState(): SocialStateValue {
  const ctx = useContext(SocialContext)
  if (!ctx) {
    throw new Error('useSocialState must be used inside <SocialProvider>')
  }
  return ctx
}
