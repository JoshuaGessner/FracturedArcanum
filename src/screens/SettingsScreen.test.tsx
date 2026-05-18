// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsScreen } from './SettingsScreen'
import { AppShellContext, type AppShellContextValue } from '../AppShellContext'
import { QueueProvider } from '../contexts/QueueProvider'
import { ProfileProvider } from '../contexts/ProfileProvider'
import { SocialProvider } from '../contexts/SocialProvider'
import { GameProvider } from '../contexts/GameProvider'
import { createGame } from '../game'
import { createPwaInstallState } from '../pwa'
import type { AdminOverview, AppScreen, CardBorder, CosmeticTheme, SettingsSubview } from '../types'

function buildShellValue(overrides: Partial<AppShellContextValue> = {}): AppShellContextValue {
  const noop = () => {}
  const asyncNoop = async () => {}
  const testGame = createGame('ai', {})
  return {
    authToken: '',
    setAuthToken: noop,
    authScreen: 'login',
    setAuthScreen: noop,
    authForm: { username: '', password: '', recoveryCode: '' },
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
    serverProfile: { accountId: 'acct-1', username: 'josh', displayName: 'Josh', role: 'user', shards: 180, seasonRating: 1210, wins: 3, losses: 2, streak: 1, deckConfig: {}, ownedThemes: ['royal'], selectedTheme: 'royal', ownedCardBorders: ['default'], selectedCardBorder: 'default', lastDaily: '', totalEarned: 0 },
    setServerProfile: noop,
    shards: 180,
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
    passkeys: [],
    passkeySupported: true,
    passkeyLoading: false,
    passkeyStatus: '',
    accountSessions: [],
    accountActionStatus: '',
    accountActionLoading: false,
    recoveryStatus: null,
    refreshPasskeys: asyncNoop,
    refreshAccountSessions: asyncNoop,
    refreshRecoveryStatus: asyncNoop,
    handleGenerateRecoveryCodes: asyncNoop,
    handleRegisterPasskey: asyncNoop,
    handleDeletePasskey: asyncNoop,
    handleLogoutAllSessions: asyncNoop,
    handleExportAccountData: asyncNoop,
    handleDeleteAccount: asyncNoop,
    selectedDeckSize: 20,
    deckReady: true,
    savedDecks: [],
    activeDeckId: null,
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
    activeScreen: 'settings' as AppScreen,
    openScreen: noop,
    settingsSubview: 'preferences' as SettingsSubview,
    openSettingsSubview: noop,
    resetSettingsSubview: noop,
    screenTitle: 'Settings',
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

function renderSettingsScreen(valueOverrides: Partial<AppShellContextValue> = {}) {
  const value = buildShellValue(valueOverrides)
  return render(
    <QueueProvider>
      <ProfileProvider>
        <SocialProvider>
          <GameProvider>
            <AppShellContext.Provider value={value}>
              <SettingsScreen />
            </AppShellContext.Provider>
          </GameProvider>
        </SocialProvider>
      </ProfileProvider>
    </QueueProvider>,
  )
}

function buildOwnerAdminOverrides(overrides: Partial<AppShellContextValue> = {}): Partial<AppShellContextValue> {
  return {
    settingsSubview: 'admin',
    accountRole: 'owner',
    isAdminRole: true,
    isOwnerRole: true,
    serverProfile: {
      accountId: 'acct-owner',
      username: 'josh',
      displayName: 'Josh',
      role: 'owner',
      shards: 180,
      seasonRating: 1210,
      wins: 3,
      losses: 2,
      streak: 1,
      deckConfig: {},
      ownedThemes: ['royal'] as CosmeticTheme[],
      selectedTheme: 'royal' as CosmeticTheme,
      ownedCardBorders: ['default'] as CardBorder[],
      selectedCardBorder: 'default' as CardBorder,
      lastDaily: '',
      totalEarned: 0,
    },
    ...overrides,
  }
}

function buildAdminOverview(): AdminOverview {
  return {
    settings: { motd: '', quest: '', featuredMode: '', maintenanceMode: false },
    totals: {
      uniqueVisitors: 4,
      sessions: 7,
      pageViews: 18,
      queueJoins: 2,
      matchesStarted: 2,
      matchesCompleted: 1,
      installs: 1,
      complaintsOpen: 2,
      complaintsResolved: 0,
      complaintsTotal: 2,
    },
    traffic: { pages: [], devices: [], daily: [] },
    complaints: [
      {
        id: 'cmp-gameplay-1',
        anonymousUser: 'acct-player',
        category: 'gameplay',
        severity: 'normal',
        summary: 'Ranked issue stays visible',
        details: 'A ranked issue should remain in the general complaints queue.',
        page: '/settings',
        status: 'open',
        createdAt: '2026-04-18T12:00:00.000Z',
        updates: [],
      },
      {
        id: 'cmp-recovery-1',
        anonymousUser: 'acct-locked',
        category: 'account_recovery',
        severity: 'high',
        summary: 'Locked out of owner account',
        details: 'The account recovery request needs owner or admin response.',
        page: '/settings',
        status: 'open',
        createdAt: '2026-04-18T13:00:00.000Z',
        updates: [{ at: '2026-04-18T13:10:00.000Z', note: 'Requester supplied username and recovery context.' }],
      },
    ],
  }
}

describe('SettingsScreen sections', () => {
  afterEach(() => {
    cleanup()
  })

  it('starts on preferences without rendering the old overview hub', () => {
    renderSettingsScreen()

    expect(screen.getByRole('button', { name: /^preferences$/i }).className).toContain('active')
    expect(screen.queryByRole('button', { name: /overview/i })).toBeNull()
    expect(screen.getByText(/arena audio/i)).toBeTruthy()
    expect(screen.queryByText(/complaint desk/i)).toBeNull()
  })

  it('uses a compact command surface without repeated status tiles', () => {
    const { container } = renderSettingsScreen()

    expect(screen.getByText(/command desk/i)).toBeTruthy()
    expect(container.textContent).not.toMatch(/profile seal/i)
    expect(container.textContent).not.toMatch(/network link/i)
    expect(container.querySelectorAll('.scene-status-tile')).toHaveLength(0)
    expect(container.querySelectorAll('.settings-status-chip').length).toBeGreaterThan(0)
  })

  it('shows persistent nav strip without Overview in support mode', () => {
    renderSettingsScreen({ settingsSubview: 'support' })

    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    expect(nav).toBeTruthy()
    expect(screen.queryByRole('button', { name: /overview/i })).toBeNull()
    expect(screen.getByRole('button', { name: /preferences/i })).toBeTruthy()
    const supportBtn = screen.getByRole('button', { name: /support/i })
    expect(supportBtn.className).toContain('active')
  })

  it('shows manual iPhone install guidance when browser install prompts are unavailable', () => {
    renderSettingsScreen({
      settingsSubview: 'preferences',
      installPromptEvent: null,
      installState: createPwaInstallState({
        hasInstallPrompt: false,
        serviceWorkerStatus: 'ready',
        platform: 'ios',
        browser: 'safari',
        secureContext: true,
        standalone: false,
      }),
    })

    expect(screen.getByText(/add to home screen/i)).toBeTruthy()
    expect(screen.getAllByText(/share/i).length).toBeGreaterThan(0)
  })

  it('shows Android browser menu guidance when Chrome has no native prompt', () => {
    renderSettingsScreen({
      settingsSubview: 'preferences',
      installState: createPwaInstallState({
        hasInstallPrompt: false,
        serviceWorkerStatus: 'ready',
        platform: 'android',
        browser: 'chrome',
        secureContext: true,
        standalone: false,
      }),
    })

    expect(screen.getByText(/open the chrome menu/i)).toBeTruthy()
    expect(screen.getByText(/install status/i)).toBeTruthy()
  })

  it('routes to the support desk from the settings nav strip', () => {
    const openSettingsSubview = vi.fn()
    renderSettingsScreen({ openSettingsSubview })

    fireEvent.click(screen.getByRole('button', { name: /^support$/i }))

    expect(openSettingsSubview).toHaveBeenCalledWith('support')
  })

  it('keeps admin hidden for regular player accounts', () => {
    const { container } = renderSettingsScreen()

    expect(screen.queryByRole('button', { name: /^admin$/i })).toBeNull()
    expect(container.querySelectorAll('.settings-status-chip')).toHaveLength(4)
  })

  it('shows admin navigation for the owner account', () => {
    renderSettingsScreen(buildOwnerAdminOverrides({ settingsSubview: 'preferences' }))

    expect(screen.getByRole('button', { name: /^admin$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /overview/i })).toBeNull()
  })

  it('adds a recovery tab to the owner admin console', () => {
    renderSettingsScreen(buildOwnerAdminOverrides({ adminOverview: buildAdminOverview() }))

    expect(screen.getByRole('tab', { name: /^recovery$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /overview/i })).toBeNull()
  })

  it('keeps account recovery requests in the recovery dashboard with response actions', () => {
    const handleUpdateComplaintStatus = vi.fn(async () => {})
    renderSettingsScreen(buildOwnerAdminOverrides({ adminOverview: buildAdminOverview(), handleUpdateComplaintStatus }))

    fireEvent.click(screen.getByRole('tab', { name: /^recovery$/i }))

    expect(screen.getByText(/account recovery requests/i)).toBeTruthy()
    expect(screen.getByText(/locked out of owner account/i)).toBeTruthy()
    expect(screen.queryByText(/ranked issue stays visible/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /request info/i }))

    expect(handleUpdateComplaintStatus).toHaveBeenCalledWith('cmp-recovery-1', 'needs_info')
  })

  it('excludes account recovery requests from the general complaints tab', () => {
    renderSettingsScreen(buildOwnerAdminOverrides({ adminOverview: buildAdminOverview() }))

    fireEvent.click(screen.getByRole('tab', { name: /^complaints$/i }))

    expect(screen.getByText(/ranked issue stays visible/i)).toBeTruthy()
    expect(screen.queryByText(/locked out of owner account/i)).toBeNull()
  })

  it('auto-loads the admin console when an owner opens it', async () => {
    const refreshAdminOverview = vi.fn(async () => {})
    renderSettingsScreen(buildOwnerAdminOverrides({ refreshAdminOverview }))

    await waitFor(() => expect(refreshAdminOverview).toHaveBeenCalledTimes(1))
  })
})
