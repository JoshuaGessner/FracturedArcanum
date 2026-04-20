import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { DEFAULT_DECK_CONFIG, type DeckConfig } from '../game'
import type {
  CardCollection,
  OpenedPackCard,
  PackOffer,
  SavedDeck,
} from '../types'
import { STORAGE_KEYS } from '../constants'
import { readStoredValue } from '../utils'

/**
 * Phase 1D — real ProfileContext.
 *
 * Owns deck/collection/cosmetic-shop state that AppShell handlers (deck CRUD,
 * pack opening, border/theme equip, daily reward) read from and write to.
 * Lives ABOVE `AppShell` in the React tree so screens can read the same slice
 * via `useProfile()` without going through the AppContext mega-bag.
 *
 * Handlers (`handleCreateDeck`, `handleOpenPack`, `handleClaimDailyReward`,
 * etc.) stay in `AppShell` because they need cross-cutting deps (authToken,
 * serverProfile + setServerProfile, askConfirm, setToastMessage,
 * sendAnalytics). AppShell consumes the setters exposed by
 * `useProfileState()` to drive state changes from those handlers and from
 * socket-driven payloads.
 *
 * `serverProfile` and the values derived from it (`shards`, `seasonRating`,
 * `rankLabel`, etc.) intentionally remain in AppShell for now — they will
 * migrate when the AppContext (auth/profile root) split lands.
 */

export type BuilderFilter = {
  ownedOnly: boolean
  search: string
  rarity: 'all' | 'common' | 'rare' | 'epic' | 'legendary'
}

export type PendingBreakdown = { cardId: string; qty: number } | null

export type ProfileStateValue = {
  savedDecks: SavedDeck[]
  setSavedDecks: Dispatch<SetStateAction<SavedDeck[]>>
  activeDeckId: string | null
  setActiveDeckId: Dispatch<SetStateAction<string | null>>
  builderFilter: BuilderFilter
  setBuilderFilter: Dispatch<SetStateAction<BuilderFilter>>
  pendingBreakdown: PendingBreakdown
  setPendingBreakdown: Dispatch<SetStateAction<PendingBreakdown>>
  deckConfig: DeckConfig
  setDeckConfig: Dispatch<SetStateAction<DeckConfig>>
  collection: CardCollection
  setCollection: Dispatch<SetStateAction<CardCollection>>
  packOffers: PackOffer[]
  setPackOffers: Dispatch<SetStateAction<PackOffer[]>>
  openedPackCards: OpenedPackCard[]
  setOpenedPackCards: Dispatch<SetStateAction<OpenedPackCard[]>>
  packOpening: string | null
  setPackOpening: Dispatch<SetStateAction<string | null>>
  prevCollectionSnapshot: CardCollection | null
  setPrevCollectionSnapshot: Dispatch<SetStateAction<CardCollection | null>>
}

const ProfileContext = createContext<ProfileStateValue | null>(null)

const INITIAL_BUILDER_FILTER: BuilderFilter = {
  ownedOnly: false,
  search: '',
  rarity: 'all',
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([])
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null)
  const [builderFilter, setBuilderFilter] = useState<BuilderFilter>(INITIAL_BUILDER_FILTER)
  const [pendingBreakdown, setPendingBreakdown] = useState<PendingBreakdown>(null)
  const [deckConfig, setDeckConfig] = useState<DeckConfig>(() =>
    readStoredValue<DeckConfig>(STORAGE_KEYS.deck, DEFAULT_DECK_CONFIG),
  )
  const [collection, setCollection] = useState<CardCollection>({})
  const [packOffers, setPackOffers] = useState<PackOffer[]>([])
  const [openedPackCards, setOpenedPackCards] = useState<OpenedPackCard[]>([])
  const [packOpening, setPackOpening] = useState<string | null>(null)
  const [prevCollectionSnapshot, setPrevCollectionSnapshot] = useState<CardCollection | null>(null)

  const value = useMemo<ProfileStateValue>(
    () => ({
      savedDecks,
      setSavedDecks,
      activeDeckId,
      setActiveDeckId,
      builderFilter,
      setBuilderFilter,
      pendingBreakdown,
      setPendingBreakdown,
      deckConfig,
      setDeckConfig,
      collection,
      setCollection,
      packOffers,
      setPackOffers,
      openedPackCards,
      setOpenedPackCards,
      packOpening,
      setPackOpening,
      prevCollectionSnapshot,
      setPrevCollectionSnapshot,
    }),
    [
      savedDecks,
      activeDeckId,
      builderFilter,
      pendingBreakdown,
      deckConfig,
      collection,
      packOffers,
      openedPackCards,
      packOpening,
      prevCollectionSnapshot,
    ],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

/**
 * Internal hook used by `AppShell` to read state AND setters. Screens should
 * use `useProfile()` from `src/contexts/useProfile.ts` instead, which exposes
 * the readonly slice plus the action handlers from AppShell.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useProfileState(): ProfileStateValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    throw new Error('useProfileState must be used inside <ProfileProvider>')
  }
  return ctx
}
