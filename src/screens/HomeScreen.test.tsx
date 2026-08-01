// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HomeScreen } from './HomeScreen'
import { AppShellContext, type AppShellContextValue } from '../AppShellContext'
import { QueueProvider } from '../contexts/QueueProvider'
import { ProfileProvider } from '../contexts/ProfileProvider'
import { SocialProvider } from '../contexts/SocialProvider'
import { GameProvider } from '../contexts/GameProvider'
import { PlayerProvider } from '../contexts/PlayerProvider'
import { createGame } from '../game'
import { createPwaInstallState } from '../pwa'
import type { AppScreen, ServerProfile } from '../types'

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
    displayName: 'josh',
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
    activeScreen: 'home' as AppScreen,
    openScreen: noop,
    settingsSubview: 'preferences',
    openSettingsSubview: noop,
    resetSettingsSubview: noop,
    screenTitle: 'Arena Home',
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

function renderHomeScreen(
  valueOverrides: Partial<AppShellContextValue> = {},
  profileOverrides: Partial<ServerProfile> = {},
) {
  const value = buildShellValue(valueOverrides)
  return render(
    <PlayerProvider seed={buildPlayerProfile(profileOverrides)}>
      <QueueProvider>
        <ProfileProvider>
          <SocialProvider>
            <GameProvider>
              <AppShellContext.Provider value={value}>
                <HomeScreen />
              </AppShellContext.Provider>
            </GameProvider>
          </SocialProvider>
        </ProfileProvider>
      </QueueProvider>
    </PlayerProvider>,
  )
}

describe('HomeScreen navigation and footer', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not duplicate the primary navigation destinations on the dashboard', () => {
    const { container } = renderHomeScreen()

    expect(container.querySelectorAll('.nav-tile')).toHaveLength(0)
  })

  it('uses a compact status ribbon with the quest board as the focal panel', () => {
    const { container } = renderHomeScreen()

    expect(container.textContent).toMatch(/league/i)
    expect(container.textContent).toMatch(/deck/i)
    expect(container.textContent).toMatch(/vault/i)
    expect(container.textContent).toMatch(/quest board/i)
    expect(container.querySelector('.home-status-ribbon')).not.toBeNull()
    expect(container.querySelector('.home-quest-board')).not.toBeNull()
    expect(container.querySelectorAll('.home-status-chip')).toHaveLength(3)
    expect(container.querySelectorAll('.home-status-card')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/war table status/i)
  })

  it('opens the quest ledger from the explicit ledger CTA', () => {
    const { container } = renderHomeScreen()
    const ledgerButton = screen.getByRole('button', { name: /open quest ledger/i })

    expect(container.querySelector('.quest-summary')).toBeNull()
    expect(container.textContent).toMatch(/quest board/i)
    expect(container.textContent).toMatch(/silver cache/i)

    fireEvent.click(ledgerButton)

    expect(screen.getByText(/quest ledger/i)).toBeTruthy()
    expect(screen.getByText(/arena contracts/i)).toBeTruthy()
  })

  it('shows the core home progress details in the unified header', () => {
    const { container, getByText } = renderHomeScreen({ nextRewardLabel: 'Reward Ready' }, { lastDaily: '' })

    expect(container.textContent).toMatch(/league/i)
    expect(container.textContent).toMatch(/deck/i)
    expect(container.textContent).toMatch(/vault/i)
    expect(container.querySelector('[role="progressbar"][aria-label="Season rating progress"]')).not.toBeNull()
    expect(getByText(/1210 \/ 1300/i)).toBeTruthy()
    expect(getByText(/20\/14/i)).toBeTruthy()
    expect(getByText(/forge stocked/i)).toBeTruthy()
    expect(getByText(/ready to claim/i)).toBeTruthy()
    expect(container.querySelectorAll('.home-status-chip')).toHaveLength(3)
  })
})
