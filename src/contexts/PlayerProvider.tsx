import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { getRankBand } from '../utils'
import type { CardBorder, CosmeticTheme, ServerProfile } from '../types'

/**
 * The server-authoritative player record, and everything read off it.
 *
 * `serverProfile` is the one object the server owns and the client only ever
 * mirrors: shards, season rating, win/loss record, owned and equipped
 * cosmetics, last daily claim, account role. Eighteen values in the UI are
 * nothing more than a field of it with a default, or arithmetic over those
 * fields — and all eighteen were computed in `AppShell` and republished through
 * `AppShellContextValue`.
 *
 * That made the shell context the transport for state it did not own. A screen
 * asking `useProfile()` for `shards` got an answer that travelled
 * profile → AppShell → appCtx → useProfile → screen, and every one of those
 * hops had to be edited to add a nineteenth value.
 *
 * Here the state and its derivations sit together and `useProfile()` reads them
 * directly. This is deliberately separate from the two neighbouring providers:
 *
 *   - `AccountProvider` is about *getting in* — sign-in, passkeys, recovery.
 *     It has no opinion on what the account owns.
 *   - `ProfileProvider` holds *client-side* deck, collection, and shop state.
 *
 * The account-readiness derivations (`accountSetupRequired` and the requirement
 * predicates) intentionally stay in `AppShell`: they combine this profile with
 * AccountProvider's `setupRequired`, `loggedIn`, and `pendingRecoveryCodes`, so
 * they belong to neither provider alone.
 */

export type PlayerStateValue = {
  serverProfile: ServerProfile | null
  setServerProfile: Dispatch<SetStateAction<ServerProfile | null>>

  // ─── Straight reads, with the default used before the first fetch ─────
  shards: number
  seasonRating: number
  record: { wins: number; losses: number; streak: number }
  ownedThemes: CosmeticTheme[]
  selectedTheme: CosmeticTheme
  ownedCardBorders: CardBorder[]
  selectedCardBorder: CardBorder
  lastDailyClaim: string
  accountRole: 'user' | 'admin' | 'owner'
  isAdminRole: boolean
  isOwnerRole: boolean

  // ─── Arithmetic over those reads ──────────────────────────────────────
  rankLabel: string
  /** Rating at which the next rank begins — the far end of the progress bar. */
  nextRankTarget: number
  /** Position within the current rank band, 0–100. */
  rankProgress: number
  totalGames: number
  /** Whole percent; 0 when no games have been played. */
  winRate: number
  /** Today in UTC as `YYYY-MM-DD` — the shape the server stores `lastDaily` in. */
  todayKey: string
  canClaimDailyReward: boolean
}

const PlayerContext = createContext<PlayerStateValue | null>(null)

/**
 * Starting profile, mirroring `ProfileProviderSeed`.
 *
 * Production never passes one — the record arrives from `/api/profile` after
 * sign-in and is `null` until then. It exists so a screen test can render at a
 * given rank or role without an effect and a round of `act()`. Only the
 * initial value is settable; the provider still owns every update after that.
 */
export function PlayerProvider({ children, seed }: { children: ReactNode; seed?: ServerProfile | null }) {
  const [serverProfile, setServerProfile] = useState<ServerProfile | null>(seed ?? null)

  // Read every render on purpose, and listed as a memo dependency below.
  // Folding it inside the memo would freeze the date until the profile next
  // changed, so a session left open past midnight would keep insisting the
  // daily reward was already claimed.
  const todayKey = new Date().toISOString().slice(0, 10)

  const value = useMemo<PlayerStateValue>(() => {
    const seasonRating = serverProfile?.seasonRating ?? 1200
    const record = {
      wins: serverProfile?.wins ?? 0,
      losses: serverProfile?.losses ?? 0,
      streak: serverProfile?.streak ?? 0,
    }
    const accountRole = serverProfile?.role ?? 'user'
    const rankBand = getRankBand(seasonRating)
    const totalGames = record.wins + record.losses
    const lastDailyClaim = serverProfile?.lastDaily ?? ''

    return {
      serverProfile,
      setServerProfile,
      shards: serverProfile?.shards ?? 0,
      seasonRating,
      record,
      ownedThemes: serverProfile?.ownedThemes ?? (['royal'] as CosmeticTheme[]),
      selectedTheme: (serverProfile?.selectedTheme ?? 'royal') as CosmeticTheme,
      ownedCardBorders: serverProfile?.ownedCardBorders ?? ['default'],
      selectedCardBorder: serverProfile?.selectedCardBorder ?? 'default',
      lastDailyClaim,
      accountRole,
      isAdminRole: accountRole === 'admin' || accountRole === 'owner',
      isOwnerRole: accountRole === 'owner',
      rankLabel: rankBand.label,
      nextRankTarget: rankBand.ceiling,
      rankProgress: rankBand.progress,
      totalGames,
      winRate: totalGames > 0 ? Math.round((record.wins / totalGames) * 100) : 0,
      todayKey,
      canClaimDailyReward: lastDailyClaim !== todayKey,
    }
  }, [serverProfile, todayKey])

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

/**
 * Read the player record and its derived values.
 *
 * `AppShell` and the account/admin hooks use this for `setServerProfile`;
 * screens reach the same values through `useProfile()`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePlayerState(): PlayerStateValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) {
    throw new Error('usePlayerState must be used inside <PlayerProvider>')
  }
  return ctx
}
