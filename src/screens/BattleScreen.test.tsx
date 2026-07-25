// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { BattleScreen } from './BattleScreen'
import { AppShellContext, type AppShellContextValue } from '../AppShellContext'
import { QueueProvider } from '../contexts/QueueProvider'
import { ProfileProvider } from '../contexts/ProfileProvider'
import { SocialProvider } from '../contexts/SocialProvider'
import { GameProvider, useGameState } from '../contexts/GameProvider'
import { createGame } from '../game'
import { createPwaInstallState } from '../pwa'
import type { AppScreen, BattleKind, CardBorder, CosmeticTheme } from '../types'

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
    activeScreen: 'battle' as AppScreen,
    openScreen: noop,
    settingsSubview: 'preferences',
    openSettingsSubview: noop,
    resetSettingsSubview: noop,
    screenTitle: 'Battle',
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
    battleSummaryVisible: false,
    dismissBattleSummary: noop,
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
    hasBattleInProgress: true,
    gameInProgress: true,
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

function BattleStateSeeder({
  game,
  enemyTurnActive = false,
  enemyTurnLabel = '',
  selectedAttacker = null,
  battleKind,
}: {
  game?: ReturnType<typeof createGame>
  enemyTurnActive?: boolean
  enemyTurnLabel?: string
  selectedAttacker?: number | null
  battleKind?: BattleKind
}) {
  const { setGame, setEnemyTurnActive, setEnemyTurnLabel, setSelectedAttacker, setBattleKind } = useGameState()

  useEffect(() => {
    if (game) setGame(game)
    setEnemyTurnActive(enemyTurnActive)
    setEnemyTurnLabel(enemyTurnLabel)
    setSelectedAttacker(selectedAttacker)
    if (battleKind) setBattleKind(battleKind)
  }, [battleKind, enemyTurnActive, enemyTurnLabel, game, selectedAttacker, setBattleKind, setEnemyTurnActive, setEnemyTurnLabel, setGame, setSelectedAttacker])

  return null
}

function renderBattleScreen(
  valueOverrides: Partial<AppShellContextValue> = {},
  battleOverrides: {
    game?: ReturnType<typeof createGame>
    enemyTurnActive?: boolean
    enemyTurnLabel?: string
    selectedAttacker?: number | null
    battleKind?: BattleKind
  } = {},
) {
  const value = buildShellValue(valueOverrides)
  return render(
    <QueueProvider>
      <ProfileProvider>
        <SocialProvider>
          <GameProvider>
            <BattleStateSeeder {...battleOverrides} />
            <AppShellContext.Provider value={value}>
              <BattleScreen />
            </AppShellContext.Provider>
          </GameProvider>
        </SocialProvider>
      </ProfileProvider>
    </QueueProvider>,
  )
}

describe('BattleScreen mobile layout', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps the arena cohesive without large standalone frontline headers', () => {
    renderBattleScreen()

    const battleSurface = document.querySelector('.battlefield.active') as HTMLElement | null

    expect(screen.getByText(/your turn/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /end turn/i })).toBeTruthy()
    expect(screen.queryByText(/frontline/i)).toBeNull()
    expect(screen.queryByText(/play a card or choose a ready unit/i)).toBeNull()
    expect(battleSurface).toBeTruthy()
    expect(within(battleSurface as HTMLElement).getByLabelText(/battle hand/i)).toBeTruthy()
    expect(document.querySelectorAll('.battlefield.active, .hand-section.active')).toHaveLength(1)
  })

  it('does not mount the Pixi FX layer while the battle screen is hidden', () => {
    renderBattleScreen({ activeScreen: 'home' })

    expect(document.querySelector('.battlefield.hidden')).toBeTruthy()
    expect(document.querySelector('.battlefield.hidden .battle-fx-canvas')).toBeNull()
  })

  it('shows visible effect markers in the live battle hand', () => {
    renderBattleScreen()

    const battleSurface = document.querySelector('.battlefield.active') as HTMLElement | null

    expect(battleSurface).toBeTruthy()
    expect(within(battleSurface as HTMLElement).getAllByLabelText(/effect/i).length).toBeGreaterThan(0)
  })

  it('removes the redundant hand banner copy so cards stay visible', () => {
    renderBattleScreen()

    expect(screen.queryByText(/tap or drag to play/i)).toBeNull()
    expect(screen.queryByText(/hand \(\d+\)/i)).toBeNull()
  })

  it('floats the enemy-turn notice as an overlay instead of a layout banner', () => {
    renderBattleScreen({}, { enemyTurnActive: true, enemyTurnLabel: 'Planning the next move' })

    const overlay = document.querySelector('.enemy-turn-banner.enemy-turn-banner-floating') as HTMLElement | null

    expect(overlay).toBeTruthy()
    expect(screen.getByText(/enemy is thinking/i)).toBeTruthy()
    expect(screen.getByText(/planning the next move/i)).toBeTruthy()
  })

  it('shows a battle summary popup instead of the old fallback result card', () => {
    const finishedGame = createGame('ai', {})
    finishedGame.winner = 'player'

    renderBattleScreen({
      activePlayer: finishedGame.player,
      defendingPlayer: finishedGame.enemy,
      battleSummaryVisible: true,
    }, {
      game: finishedGame,
    })

    const dialog = screen.getByRole('dialog', { name: /battle summary/i })
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('data-scene-swipe-opt-out')).toBe('true')
    expect(screen.getByText(/practice match/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /play again/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /leave to lobby/i })).toBeTruthy()
    expect(screen.queryByText(/victory screen/i)).toBeNull()
  })

  it('does not keep the battle summary overlay mounted after leaving battle', () => {
    const finishedGame = createGame('ai', {})
    finishedGame.winner = 'enemy'

    renderBattleScreen({ activeScreen: 'home' }, { game: finishedGame })

    expect(screen.queryByRole('dialog', { name: /battle summary/i })).toBeNull()
  })

  it('hides play again for ranked results and routes leave through the battle handler', () => {
    const handleLeaveBattle = vi.fn()
    const finishedGame = createGame('duel', {})
    finishedGame.winner = 'enemy'

    renderBattleScreen({
      battleSummaryVisible: true,
      isRankedBattle: true,
      handleLeaveBattle,
    }, {
      game: finishedGame,
      battleKind: 'ranked',
    })

    expect(screen.queryByRole('button', { name: /play again/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /leave to lobby/i }))
    expect(handleLeaveBattle).toHaveBeenCalledTimes(1)
  })

  it('moves strike hero into the centerline target control', () => {
    const activeGame = createGame('ai', {})
    activeGame.player.board[0] = {
      instanceId: 'ally-instance-1',
      uid: 'ally-1',
      id: 'spark-imp',
      name: 'Crawling Spark',
      icon: '⚡',
      cost: 1,
      attack: 2,
      health: 1,
      currentHealth: 1,
      exhausted: false,
      rarity: 'common',
      tribe: 'elemental',
      text: 'Test ally',
    }

    renderBattleScreen({
      activePlayer: activeGame.player,
      defendingPlayer: activeGame.enemy,
    }, {
      game: activeGame,
      selectedAttacker: 0,
    })

    const strikeButton = screen.getByRole('button', { name: /strike hero/i })
    expect(strikeButton.closest('.battle-centerline')).toBeTruthy()
    expect(strikeButton.closest('.battle-action-dock')).toBeNull()
  })

  it('orders player resources as momentum, mana, then health', () => {
    renderBattleScreen()

    const playerAnchor = document.querySelector('.battle-hero-anchor.player') as HTMLElement
    const momentum = within(playerAnchor).getByLabelText(/momentum/i)
    const mana = within(playerAnchor).getByLabelText(/mana/i)
    const health = within(playerAnchor).getByLabelText(/health/i)
    const children = Array.from(playerAnchor.children)

    expect(children.indexOf(momentum)).toBeLessThan(children.indexOf(mana))
    expect(children.indexOf(mana)).toBeLessThan(children.indexOf(health))
  })

  it('uses a consistent Empty Lane label for both sides', () => {
    renderBattleScreen()

    expect(screen.getAllByText('Empty Lane').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText(/open lane/i)).toBeNull()
  })

  it('lets players drag a ready board unit to the center hero target', () => {
    const handleAttackFrom = vi.fn()
    const activeGame = createGame('ai', {})
    activeGame.player.board[0] = {
      instanceId: 'ally-instance-1',
      uid: 'ally-1',
      id: 'spark-imp',
      name: 'Crawling Spark',
      icon: '⚡',
      cost: 1,
      attack: 2,
      health: 1,
      currentHealth: 1,
      exhausted: false,
      rarity: 'common',
      tribe: 'elemental',
      text: 'Test ally',
    }

    renderBattleScreen({
      activePlayer: activeGame.player,
      defendingPlayer: activeGame.enemy,
      handleAttackFrom,
    }, {
      game: activeGame,
    })

    const heroTarget = document.querySelector('[data-hero-target="enemy"]') as Element
    const elementFromPoint = vi.fn(() => heroTarget)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    })
    const playerSide = document.querySelector('.player-side') as HTMLElement
    const unitButton = within(playerSide).getByRole('button', { name: /crawling spark artwork/i })

    fireEvent.pointerDown(unitButton, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120, clientY: 320 })
    fireEvent.pointerMove(unitButton, { pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 280 })
    fireEvent.pointerUp(unitButton, { pointerId: 1, pointerType: 'mouse', clientX: 160, clientY: 240 })

    expect(handleAttackFrom).toHaveBeenCalledWith(0, 'hero')
    expect(elementFromPoint).toHaveBeenCalled()
  })

  it('hides the strike-hero control when guard still blocks the lane', () => {
    const guardedGame = createGame('ai', {})
    guardedGame.player.board[0] = {
      instanceId: 'ally-instance-1',
      uid: 'ally-1',
      id: 'spark-imp',
      name: 'Crawling Spark',
      icon: '⚡',
      cost: 1,
      attack: 2,
      health: 1,
      currentHealth: 1,
      exhausted: false,
      rarity: 'common',
      tribe: 'elemental',
      text: 'Test ally',
    }

    renderBattleScreen({
      activePlayer: guardedGame.player,
      defendingPlayer: guardedGame.enemy,
      defenderHasGuard: true,
    }, {
      game: guardedGame,
      selectedAttacker: 0,
    })

    expect(screen.queryByRole('button', { name: /strike hero/i })).toBeNull()
    expect(screen.getByText(/guard blocks the hero/i)).toBeTruthy()
  })

  it('marks battle card art as non-draggable so long press stays inside inspect flow', () => {
    renderBattleScreen()

    const art = Array.from(document.querySelectorAll('.card-illustration, .unit-portrait')) as HTMLImageElement[]
    expect(art.length).toBeGreaterThan(0)
    expect(art.every((img) => img.getAttribute('draggable') === 'false')).toBe(true)
  })

  it('supports drag-to-play with an upward pull gesture on a playable card', () => {
    const handlePlayCard = vi.fn()
    const game = createGame('ai', {})

    game.player.hand = [
      {
        ...game.player.hand[0],
        instanceId: 'playable-card',
        name: 'Test Wisp',
        cost: 1,
        effect: 'charge',
      },
      ...game.player.hand.slice(1),
    ]
    game.player.mana = 1
    game.player.maxMana = 1
    game.player.board = [null, null, null]

    renderBattleScreen({
      activePlayer: game.player,
      defendingPlayer: game.enemy,
      handlePlayCard,
      activeBoardHasOpenLane: true,
    }, {
      game,
    })

    const card = screen.getByRole('button', { name: /test wisp/i })

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 120, clientY: 520, button: 0, pointerType: 'touch' })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 122, clientY: 470, pointerType: 'touch' })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 122, clientY: 430, pointerType: 'touch' })

    expect(handlePlayCard).toHaveBeenCalledWith(0, 0)
  })

  it('uses stricter long-press settings for battle hand cards', () => {
    const getLongPressProps = vi.fn(() => ({}))

    renderBattleScreen({ getLongPressProps })

    expect(getLongPressProps).toHaveBeenCalledWith(expect.objectContaining({ name: expect.any(String) }), {
      delayMs: 540,
      moveTolerancePx: 5,
      axisCancel: 'any',
    })
  })

  it('lets horizontal hand swipes browse cards without creating a drag ghost', () => {
    const handlePlayCard = vi.fn()
    const getLongPressProps = vi.fn(() => ({ onPointerMove: vi.fn() }))
    const game = createGame('ai', {})
    game.player.hand = [
      {
        ...game.player.hand[0],
        instanceId: 'playable-card',
        name: 'Swipe Wisp',
        cost: 1,
      },
      ...game.player.hand.slice(1),
    ]
    game.player.mana = 1
    game.player.maxMana = 1

    renderBattleScreen({
      activePlayer: game.player,
      defendingPlayer: game.enemy,
      activeBoardHasOpenLane: true,
      handlePlayCard,
      getLongPressProps,
    }, {
      game,
    })

    const card = screen.getByRole('button', { name: /swipe wisp/i })

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 120, clientY: 520, button: 0, pointerType: 'touch' })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 148, clientY: 522, pointerType: 'touch' })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 148, clientY: 522, pointerType: 'touch' })
    fireEvent.click(card)

    expect(document.querySelector('.battle-drag-ghost')).toBeNull()
    expect(document.querySelector('.hand-fan-grid.is-drag-active')).toBeNull()
    expect(handlePlayCard).not.toHaveBeenCalled()
  })

  it('renders a fixed drag ghost while a hand card is dragged out of the rail', () => {
    const game = createGame('ai', {})
    game.player.hand = [
      {
        ...game.player.hand[0],
        instanceId: 'playable-card',
        name: 'Test Wisp',
        cost: 1,
        effect: 'charge',
      },
      ...game.player.hand.slice(1),
    ]
    game.player.mana = 1
    game.player.maxMana = 1
    game.player.board = [null, null, null]

    renderBattleScreen({
      activePlayer: game.player,
      defendingPlayer: game.enemy,
      activeBoardHasOpenLane: true,
    })

    const card = screen.getByRole('button', { name: /test wisp/i })
    Object.defineProperty(card, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 100, top: 500, width: 118, height: 142, right: 218, bottom: 642, x: 100, y: 500, toJSON: () => ({}) }),
    })

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 120, clientY: 520, button: 0, pointerType: 'touch' })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 120, clientY: 470, pointerType: 'touch' })

    const ghost = document.querySelector('.battle-drag-ghost') as HTMLElement | null
    expect(ghost).toBeTruthy()
    expect(ghost?.closest('.battle-drag-layer')).toBeTruthy()
    expect(ghost?.closest('.battle-hand-rail')).toBeNull()
    expect(within(ghost as HTMLElement).getByText('Test Wisp')).toBeTruthy()
  })

  it('plays a dragged hand card into the hovered empty lane', () => {
    const handlePlayCard = vi.fn()
    const game = createGame('ai', {})

    game.player.hand = [
      {
        ...game.player.hand[0],
        instanceId: 'playable-card',
        name: 'Lane Wisp',
        cost: 1,
      },
      ...game.player.hand.slice(1),
    ]
    game.player.mana = 1
    game.player.maxMana = 1
    game.player.board = [null, null, null]

    renderBattleScreen({
      activePlayer: game.player,
      defendingPlayer: game.enemy,
      handlePlayCard,
      activeBoardHasOpenLane: true,
    }, {
      game,
    })

    const dropLane = document.querySelector('[data-drop-lane="1"]') as Element
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => dropLane),
    })
    const card = screen.getByRole('button', { name: /lane wisp/i })

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 120, clientY: 520, button: 0, pointerType: 'touch' })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 122, clientY: 470, pointerType: 'touch' })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 122, clientY: 430, pointerType: 'touch' })

    expect(handlePlayCard).toHaveBeenCalledWith(0, 1)
  })

  it('does not play a dragged hand card into an occupied hovered lane', () => {
    const handlePlayCard = vi.fn()
    const game = createGame('ai', {})

    game.player.hand = [
      {
        ...game.player.hand[0],
        instanceId: 'playable-card',
        name: 'Blocked Wisp',
        cost: 1,
      },
      ...game.player.hand.slice(1),
    ]
    game.player.mana = 1
    game.player.maxMana = 1
    game.player.board = [
      {
        instanceId: 'ally-instance-1',
        uid: 'ally-1',
        id: 'spark-imp',
        name: 'Crawling Spark',
        icon: '⚡',
        cost: 1,
        attack: 2,
        health: 1,
        currentHealth: 1,
        exhausted: false,
        rarity: 'common',
        tribe: 'elemental',
        text: 'Test ally',
      },
      null,
      null,
    ]

    renderBattleScreen({
      activePlayer: game.player,
      defendingPlayer: game.enemy,
      handlePlayCard,
      activeBoardHasOpenLane: true,
    }, {
      game,
    })

    const occupiedLane = document.querySelector('.player-side .slot:not(.empty)') as Element
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => occupiedLane),
    })
    const card = screen.getByRole('button', { name: /blocked wisp/i })

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 120, clientY: 520, button: 0, pointerType: 'touch' })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 122, clientY: 470, pointerType: 'touch' })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 122, clientY: 430, pointerType: 'touch' })

    expect(handlePlayCard).not.toHaveBeenCalled()
  })
})
