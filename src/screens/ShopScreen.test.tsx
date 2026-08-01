// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ShopScreen } from './ShopScreen'
import { PackCeremonyOverlay } from '../components/PackCeremonyOverlay'
import { AppShellContext, type AppShellContextValue } from '../AppShellContext'
import { QueueProvider } from '../contexts/QueueProvider'
import { ProfileProvider } from '../contexts/ProfileProvider'
import { GameProvider } from '../contexts/GameProvider'
import { PlayerProvider } from '../contexts/PlayerProvider'
import { createGame } from '../game'
import { createPwaInstallState } from '../pwa'
import type { AppScreen, SavedDeck, ServerProfile } from '../types'

const starterDecks: SavedDeck[] = [
  { id: 'd1', name: 'Starter', deckConfig: {}, isActive: true, createdAt: '', updatedAt: '' },
]

/**
 * The record `PlayerProvider` derives from — stated once, where the old
 * fixture stated it and then restated all eighteen values read off it.
 *
 * `lastDaily` is today's key so the default render reads as "already claimed",
 * matching what the hand-written mock asserted. Pass `{ lastDaily: '' }` for a
 * claimable one.
 */
const TODAY_KEY = new Date().toISOString().slice(0, 10)

function buildPlayerProfile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    accountId: 'acct-1',
    username: 'josh',
    displayName: 'Josh',
    role: 'user',
    shards: 180,
    seasonRating: 1210,
    wins: 3,
    losses: 2,
    streak: 1,
    deckConfig: {},
    ownedThemes: ['royal'],
    selectedTheme: 'royal',
    ownedCardBorders: ['default'],
    selectedCardBorder: 'default',
    lastDaily: TODAY_KEY,
    totalEarned: 0,
    ...overrides,
  }
}

function buildShellValue(overrides: Partial<AppShellContextValue> = {}): AppShellContextValue {
  const noop = () => {}
  const asyncNoop = async () => {}
  const testGame = createGame('ai', {})
  return {
    authToken: '',
    setAuthToken: noop,
    authScreen: 'login',
    setAuthScreen: noop,
    authForm: { username: '', password: '', recoveryCode: '', grantCode: '' },
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
    handlePasskeyLogin: asyncNoop,
    handleLogout: noop,
    nextRewardLabel: 'Silver Cache',
    justClaimedDaily: false,
    totalOwnedCards: 10,
    passkeys: [],
    passkeySupported: true,
    passkeyLoading: false,
    passkeyStatus: '',
    accountSessions: [],
    accountActionStatus: '',
    accountActionLoading: false,
    recoveryStatus: null,
    passkeyDeviceLink: null,
    refreshPasskeys: asyncNoop,
    refreshAccountSessions: asyncNoop,
    refreshRecoveryStatus: asyncNoop,
    handleGenerateRecoveryCodes: asyncNoop,
    handleCreatePasskeyDeviceLink: asyncNoop,
    handleCopyPasskeyDeviceLink: asyncNoop,
    clearPasskeyDeviceLink: noop,
    handleRegisterPasskey: asyncNoop,
    handleDeletePasskey: asyncNoop,
    handleLogoutAllSessions: asyncNoop,
    handleExportAccountData: asyncNoop,
    handleDeleteAccount: asyncNoop,
    selectedDeckSize: 20,
    deckReady: true,
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
    handleClaimQuestReward: noop,
    handleClaimQuestRewards: noop,
    activeScreen: 'shop' as AppScreen,
    openScreen: noop,
    settingsSubview: 'preferences',
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
    installState: createPwaInstallState({ hasInstallPrompt: false, serviceWorkerStatus: 'ready' }),
    pwaServiceWorkerStatus: 'ready',
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
    handleAttackFrom: noop,
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
    adminAccountDetail: null,
    adminAccountLoading: false,
    openAdminAccount: asyncNoop,
    closeAdminAccount: noop,
    adminDeletedAccounts: [],
    adminDeletedLoading: false,
    refreshDeletedAccounts: asyncNoop,
    issuedGrant: null,
    setIssuedGrant: noop,
    handleAdminIssueRecoveryGrant: asyncNoop,
    handleAdminSuspendAccount: asyncNoop,
    handleAdminUnsuspendAccount: asyncNoop,
    handleAdminDeleteAccount: asyncNoop,
    handleAdminRestoreAccount: asyncNoop,
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

function renderShopScreen(
  valueOverrides: Partial<AppShellContextValue> = {},
  profileOverrides: Partial<ServerProfile> = {},
) {
  const value = buildShellValue(valueOverrides)
  return render(
    <PlayerProvider seed={buildPlayerProfile(profileOverrides)}>
      <QueueProvider>
        <ProfileProvider seed={{ savedDecks: starterDecks, activeDeckId: 'd1' }}>
          <GameProvider>
            <AppShellContext.Provider value={value}>
              <ShopScreen />
            </AppShellContext.Provider>
          </GameProvider>
        </ProfileProvider>
      </QueueProvider>
    </PlayerProvider>,
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
        shards={100}
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

    expect(screen.getByRole('button', { name: /^overview$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^vault$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^packs$/i })).toBeTruthy()
    expect(screen.getByText(/daily vault/i)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /packs/i }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/affordable/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /break 1/i })).toBeNull()
  })

  it('uses one compact bazaar ledger instead of separate bazaar signals chrome', () => {
    const { container } = renderShopScreen({}, { lastDaily: '' })

    expect(screen.getByText(/merchant's bazaar/i)).toBeTruthy()
    expect(screen.queryByText(/bazaar signals/i)).toBeNull()
    expect(container.textContent).toMatch(/shards/i)
    expect(container.textContent).toMatch(/vault/i)
    expect(container.textContent).toMatch(/packs/i)
    expect(container.querySelectorAll('.shop-resource-chip')).toHaveLength(3)
    expect(container.querySelectorAll('.scene-status-tile')).toHaveLength(0)
  })

  it('reflects current shard reward rules in the hub and vault claim surfaces', () => {
    const { container } = renderShopScreen({}, { lastDaily: '' })

    expect(screen.getByRole('button', { name: /claim \+25/i })).toBeTruthy()
    expect(container.textContent).toMatch(/\+25/)
    expect(container.textContent).toMatch(/\+30/)
    expect(container.textContent).toMatch(/\+10/)
    expect(container.textContent).not.toMatch(/\+50/)

    fireEvent.click(screen.getByRole('button', { name: /^vault$/i }))

    expect(screen.getByRole('button', { name: /claim \+25/i })).toBeTruthy()
    expect(screen.getByLabelText(/shard reward rules/i)).toBeTruthy()
    expect(container.querySelector('.reward-vault-console')).toBeTruthy()
    expect(container.textContent).not.toMatch(/\+50/)
  })

  it('keeps the card packs view in a fit-safe in-screen grid', () => {
    const { container } = renderShopScreen()

    fireEvent.click(screen.getByRole('button', { name: /^packs$/i }))

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
        shards={100}
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
        shards={100}
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
