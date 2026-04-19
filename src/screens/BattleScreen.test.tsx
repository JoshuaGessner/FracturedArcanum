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
import type { AppScreen, CardBorder, CosmeticTheme } from '../types'

function buildShellValue(overrides: Partial<AppShellContextValue> = {}): AppShellContextValue {
  const noop = () => {}
  const asyncNoop = async () => {}
  const testGame = createGame('ai', {})
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
    activeScreen: 'battle' as AppScreen,
    openScreen: noop,
    settingsSubview: 'hub',
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

function BattleStateSeeder({
  game,
  enemyTurnActive = false,
  enemyTurnLabel = '',
  selectedAttacker = null,
}: {
  game?: ReturnType<typeof createGame>
  enemyTurnActive?: boolean
  enemyTurnLabel?: string
  selectedAttacker?: number | null
}) {
  const { setGame, setEnemyTurnActive, setEnemyTurnLabel, setSelectedAttacker } = useGameState()

  useEffect(() => {
    if (game) setGame(game)
    setEnemyTurnActive(enemyTurnActive)
    setEnemyTurnLabel(enemyTurnLabel)
    setSelectedAttacker(selectedAttacker)
  }, [enemyTurnActive, enemyTurnLabel, game, selectedAttacker, setEnemyTurnActive, setEnemyTurnLabel, setGame, setSelectedAttacker])

  return null
}

function renderBattleScreen(
  valueOverrides: Partial<AppShellContextValue> = {},
  battleOverrides: {
    game?: ReturnType<typeof createGame>
    enemyTurnActive?: boolean
    enemyTurnLabel?: string
    selectedAttacker?: number | null
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

    expect(screen.getByText(/your command phase/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /end turn/i })).toBeTruthy()
    expect(screen.queryByText(/frontline/i)).toBeNull()
    expect(screen.queryByText(/play a card or choose a ready unit/i)).toBeNull()
    expect(battleSurface).toBeTruthy()
    expect(within(battleSurface as HTMLElement).getByLabelText(/battle hand/i)).toBeTruthy()
    expect(document.querySelectorAll('.battlefield.active, .hand-section.active')).toHaveLength(1)
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
    expect(screen.getByRole('button', { name: /play again/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /leave to lobby/i })).toBeTruthy()
    expect(screen.queryByText(/victory screen/i)).toBeNull()
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
    })

    const card = screen.getByRole('button', { name: /test wisp/i })

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 120, clientY: 520, button: 0, pointerType: 'touch' })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 122, clientY: 470, pointerType: 'touch' })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 122, clientY: 430, pointerType: 'touch' })

    expect(handlePlayCard).toHaveBeenCalledWith(0)
  })
})
