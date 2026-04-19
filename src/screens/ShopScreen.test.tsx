// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ShopScreen } from './ShopScreen'
import { PackCeremonyOverlay } from '../components/PackCeremonyOverlay'
import { AppShellContext, type AppShellContextValue } from '../AppShellContext'
import { QueueProvider } from '../contexts/QueueProvider'
import { ProfileProvider } from '../contexts/ProfileProvider'
import { GameProvider } from '../contexts/GameProvider'
import { createGame } from '../game'
import type { AppScreen, CosmeticTheme, CardBorder, SavedDeck } from '../types'

function buildShellValue(overrides: Partial<AppShellContextValue> = {}): AppShellContextValue {
  const noop = () => {}
  const asyncNoop = async () => {}
  const testGame = createGame('ai', {})
  const starterDecks: SavedDeck[] = [{ id: 'd1', name: 'Starter', deckConfig: {}, isActive: true, createdAt: '', updatedAt: '' }]
  return {
    authToken: '',
    setAuthToken: noop,
    authScreen: 'login',
    setAuthScreen: noop,
    authForm: { username: '', password: '' },
    setAuthForm: noop,
    authError: '',
    authLoading: false,
    loggedIn: true,
    setupRequired: false,
    setupForm: { username: '', password: '' },
    setSetupForm: noop,
    setupError: '',
    setupLoading: false,
    handleSetup: asyncNoop,
    handleAuth: asyncNoop,
    handleLogout: noop,
    serverProfile: { accountId: 'acct-1', username: 'josh', displayName: 'Josh', role: 'user', runes: 180, seasonRating: 1210, wins: 3, losses: 2, streak: 1, deckConfig: {}, ownedThemes: ['royal'], selectedTheme: 'royal', ownedCardBorders: ['default'], selectedCardBorder: 'default', lastDaily: '', totalEarned: 0 },
    setServerProfile: noop,
    runes: 180,
    seasonRating: 1210,
    record: { wins: 3, losses: 2, streak: 1 },
    ownedThemes: ['royal'] as CosmeticTheme[],
    selectedTheme: 'royal' as CosmeticTheme,
    ownedCardBorders: ['default'] as CardBorder[],
    selectedCardBorder: 'default' as CardBorder,
    lastDailyClaim: '',
    accountRole: 'user',
    isAdminRole: false,
    isOwnerRole: false,
    rankLabel: 'Silver',
    totalGames: 5,
    winRate: 60,
    rankProgress: 40,
    nextRankTarget: 1300,
    nextRewardLabel: 'Silver Cache',
    todayKey: '2026-04-18',
    canClaimDailyReward: false,
    justClaimedDaily: false,
    totalOwnedCards: 10,
    selectedDeckSize: 20,
    deckReady: true,
    savedDecks: starterDecks,
    activeDeckId: 'd1',
    handleCreateDeck: noop,
    handleRenameDeck: noop,
    handleDeleteDeck: noop,
    handleSelectDeck: noop,
    handleBreakdownCard: noop,
    handleDeckCount: noop,
    handleOpenPack: async () => {},
    handlePurchaseBorder: noop,
    handleSelectBorder: noop,
    handleEquipTheme: noop,
    handleClaimDailyReward: noop,
    activeScreen: 'shop' as AppScreen,
    openScreen: noop,
    settingsSubview: 'hub',
    openSettingsSubview: noop,
    resetSettingsSubview: noop,
    screenTitle: 'Shop',
    toastMessage: '',
    toastSeverity: 'info',
    toastStack: [],
    setToastMessage: noop,
    inferToastSeverity: () => 'info',
    confirmRequest: null,
    confirmTextInput: '',
    setConfirmTextInput: noop,
    askConfirm: async () => false,
    closeConfirm: noop,
    consumeLongPressAction: () => false,
    getLongPressProps: () => ({}),
    cinemaSequence: null,
    presentRewardCinema: noop,
    dismissRewardCinema: noop,
    lastPackRefund: 0,
    setLastPackRefund: noop,
    tourVisible: false,
    startOnboardingTour: noop,
    dismissOnboardingTour: noop,
    installPromptEvent: null,
    handleInstallApp: asyncNoop,
    swUpdateAvailable: false,
    handleAcceptUpdate: noop,
    handleDismissUpdate: noop,
    soundEnabled: false,
    setSoundEnabled: noop,
    ambientEnabled: false,
    setAmbientEnabled: noop,
    gesturesEnabled: true,
    setGesturesEnabled: noop,
    hapticsEnabled: false,
    setHapticsEnabled: noop,
    analyticsConsent: false,
    setAnalyticsConsent: noop,
    visitorId: 'test-visitor',
    backendOnline: true,
    dailyQuest: 'Win 1 ranked arena match',
    featuredMode: 'Ranked Blitz',
    seasonName: 'Season of Whispers',
    seasonEnd: null,
    handleStartQueue: noop,
    handleCancelQueue: noop,
    handleAcceptQueue: noop,
    isRankedBattle: false,
    isLocalPassBattle: false,
    hasBattleInProgress: false,
    gameInProgress: false,
    resolvedAIDifficulty: 'novice',
    activePlayer: testGame.player,
    defendingPlayer: testGame.enemy,
    isMyTurn: true,
    defenderHasGuard: false,
    activeBoardHasOpenLane: true,
    startMatch: noop,
    handleQuickBattle: noop,
    handleResumeBattle: noop,
    handleAbandonBattle: noop,
    handleLeaveBattle: noop,
    handleModeChange: noop,
    handleAIDifficultyChange: noop,
    handlePlayCard: noop,
    handleSelectAttacker: noop,
    handleAttackTarget: noop,
    handleBurst: noop,
    handleEndTurn: noop,
    handleAddFriend: asyncNoop,
    handleRemoveFriend: asyncNoop,
    handleChallengeFriend: noop,
    handleAcceptChallenge: noop,
    handleDeclineChallenge: noop,
    handleCancelOutgoingChallenge: noop,
    handleCreateClan: asyncNoop,
    handleJoinClan: asyncNoop,
    handleLeaveClan: asyncNoop,
    handleProposeTrade: asyncNoop,
    handleTradeAction: asyncNoop,
    addTradeChip: noop,
    removeTradeChip: noop,
    formatCountdown: () => '0s',
    complaintForm: { category: 'gameplay', severity: 'normal', summary: '', details: '' },
    setComplaintForm: noop,
    complaintStatus: '',
    handleSubmitComplaint: asyncNoop,
    adminOverview: null,
    adminLoading: false,
    adminError: '',
    adminUsers: [],
    adminUsersLoading: false,
    adminUserSearch: '',
    setAdminUserSearch: noop,
    adminAudit: [],
    adminAuditFilter: 'all',
    setAdminAuditFilter: noop,
    adminAuditExpandedId: null,
    setAdminAuditExpandedId: noop,
    adminSettings: { motd: '', quest: '', featuredMode: '', maintenanceMode: false },
    setAdminSettings: noop,
    transferForm: { targetAccountId: '', password: '' },
    setTransferForm: noop,
    transferStatus: '',
    refreshAdminOverview: asyncNoop,
    refreshAdminUsers: asyncNoop,
    refreshAdminAudit: asyncNoop,
    handleSetUserRole: asyncNoop,
    handleTransferOwnership: asyncNoop,
    handleSaveAdminSettings: asyncNoop,
    handleUpdateComplaintStatus: asyncNoop,
    ...overrides,
  }
}

function renderShopScreen(valueOverrides: Partial<AppShellContextValue> = {}) {
  const value = buildShellValue(valueOverrides)
  return render(
    <QueueProvider>
      <ProfileProvider>
        <GameProvider>
          <AppShellContext.Provider value={value}>
            <ShopScreen />
          </AppShellContext.Provider>
        </GameProvider>
      </ProfileProvider>
    </QueueProvider>,
  )
}

describe('ShopScreen hub flow', () => {
  afterEach(() => {
    cleanup()
  })

  it('marks the pack ceremony as swipe-isolated so reveal browsing does not switch scenes', () => {
    render(
      <PackCeremonyOverlay
        cards={[{ id: 'spark-imp', rarity: 'common', duplicate: false }]}
        packId="standard"
        packCost={20}
        runes={100}
        prevCollection={{}}
        soundEnabled={false}
        hapticsEnabled={false}
        packOpening={null}
        onOpenAnother={() => {}}
        onClose={() => {}}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /card pack opening/i })
    expect(dialog.getAttribute('data-scene-swipe-opt-out')).toBe('true')
  })

  it('starts on a compact shop hub instead of rendering the breakdown panel immediately', () => {
    renderShopScreen()

    expect(screen.getByRole('button', { name: /reward vault/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /card packs/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /break 1/i })).toBeNull()
  })

  it('uses one unified bazaar header instead of separate bazaar signals chrome', () => {
    const { container } = renderShopScreen({ canClaimDailyReward: true })

    expect(screen.getByText(/merchant's bazaar/i)).toBeTruthy()
    expect(screen.queryByText(/bazaar signals/i)).toBeNull()
    expect(container.textContent).toMatch(/shard cache/i)
    expect(container.textContent).toMatch(/daily vault/i)
    expect(container.textContent).toMatch(/pack stash/i)
    expect(container.querySelectorAll('.scene-status-tile')).toHaveLength(3)
  })

  it('keeps the card packs view in a fit-safe in-screen grid', () => {
    const { container } = renderShopScreen()

    fireEvent.click(screen.getByRole('button', { name: /card packs/i }))

    expect(container.textContent).toMatch(/card packs/i)
    expect(container.querySelector('.theme-grid-shop-fit')).toBeTruthy()
    expect(screen.getByRole('button', { name: /back/i })).toBeTruthy()
  })

  it('resets ceremony reveal state when a fresh pack result arrives', async () => {
    const { rerender } = render(
      <PackCeremonyOverlay
        cards={[{ id: 'spark-imp', rarity: 'common', duplicate: false }]}
        packId="standard"
        packCost={20}
        runes={100}
        prevCollection={{}}
        soundEnabled={false}
        hapticsEnabled={false}
        packOpening={null}
        onOpenAnother={() => {}}
        onClose={() => {}}
      />, 
    )

    const firstButton = screen.getByRole('button', { name: /reveal card 1/i })
    fireEvent.click(firstButton)
    expect(firstButton.getAttribute('aria-pressed')).toBe('true')

    rerender(
      <PackCeremonyOverlay
        cards={[{ id: 'bog-lurker', rarity: 'rare', duplicate: false }]}
        packId="standard"
        packCost={20}
        runes={100}
        prevCollection={{}}
        soundEnabled={false}
        hapticsEnabled={false}
        packOpening={null}
        onOpenAnother={() => {}}
        onClose={() => {}}
      />,
    )

    const resetButton = await screen.findByRole('button', { name: /reveal card 1/i })
    expect(resetButton.getAttribute('aria-pressed')).toBe('false')
  })
})
