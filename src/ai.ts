import {
  AI_DIFFICULTY_PROFILES,
  BOARD_SIZE,
  STARTING_HEALTH,
  attack,
  boardHasGuard,
  castMomentumBurst,
  hasKeyword,
  otherSide,
  passTurn,
  playCard,
  type AIDifficulty,
  type AIDifficultyProfile,
  type BattleSide,
  type CardInstance,
  type GameState,
  type PlayerState,
  type Unit,
} from './game.js'

/**
 * Position evaluation for the AI.
 *
 * Everything the AI does today scores a *card* in isolation: cost, attack,
 * health, its effect, plus two facts about the AI itself. Nothing in that
 * pipeline can see the opponent's board, so the AI cannot tell that a Blast is
 * excellent right now because you have two units on three health, or that a
 * Guard is the only card that matters because it is facing lethal.
 *
 * This module scores a *position* instead. That single change is what the three
 * missing abilities are all built from:
 *
 *   - board reading — evaluation sees both sides, so a card is judged by the
 *     board it produces rather than by its own stat line
 *   - attack sequencing — try orderings, keep the one whose resulting position
 *     evaluates best
 *   - mana planning — try affordable combinations, same
 *
 * It also removes the need for lethal detection to exist as its own rule. A
 * position where `winner === side` evaluates to `WIN`, which dominates every
 * other term, so any search that can reach a win takes it. Lethal is a
 * consequence of the evaluator rather than a separate code path that can carry
 * its own bugs — and "Legend never misses lethal" is then a property of the
 * search depth, not of a hand-written check.
 *
 * Lives outside `game.ts` on purpose: that file is already 1,600 lines and a
 * standing complexity hotspot, and the engine build emits imported siblings, so
 * `server/ai.js` ships alongside `server/game.js`.
 */

/**
 * Terminal scores. Large enough to dominate any positional term, finite so
 * that arithmetic on them stays meaningful — `Infinity - Infinity` is NaN, and
 * a NaN score silently loses every comparison it takes part in.
 */
export const WIN = 1_000_000
export const LOSS = -1_000_000

/**
 * How the pieces of a position trade off.
 *
 * Health is deliberately worth less per point than board presence. A unit
 * generates its attack every turn while a point of health is spent once, and
 * on a three-lane board with a 24-point clock the side holding the board
 * usually converts it before the other side's life total matters. Tuned
 * against `npm run ai:arena`, not from taste.
 */
export type EvalWeights = {
  attack: number
  health: number
  guard: number
  /** Keywords that make a unit disproportionately annoying to remove. */
  evasive: number
  /** Per point of hero health. */
  heroHealth: number
  /** Per card in hand. */
  card: number
  /** Per point of momentum, which buys a burst at 3. */
  momentum: number
}

export const DEFAULT_EVAL_WEIGHTS: EvalWeights = {
  attack: 2.2,
  health: 1.6,
  guard: 2.5,
  evasive: 2,
  heroHealth: 1.1,
  card: 1.5,
  momentum: 0.4,
}

/** Keywords worth more than their stat line suggests when left on the board. */
const EVASIVE_KEYWORDS = ['poison', 'lifesteal', 'cleave', 'overwhelm'] as const

/**
 * What a single unit is worth sitting on the board.
 *
 * Uses `currentHealth`, not printed health: a 5/5 chipped to 5/1 is nearly
 * dead and should be valued that way, which is exactly the distinction a
 * card-level scorer cannot make because it only ever sees cards in hand.
 */
export function unitValue(unit: Unit, weights: EvalWeights = DEFAULT_EVAL_WEIGHTS): number {
  let value = unit.attack * weights.attack + unit.currentHealth * weights.health
  if (hasKeyword(unit, 'guard')) value += weights.guard
  for (const keyword of EVASIVE_KEYWORDS) {
    if (hasKeyword(unit, keyword)) {
      value += weights.evasive
      break
    }
  }
  return value
}

/** Everything one side has on the table. */
function sideValue(player: PlayerState, weights: EvalWeights): number {
  let value = player.health * weights.heroHealth
    + player.hand.length * weights.card
    + player.momentum * weights.momentum

  for (const unit of player.board) {
    if (unit) value += unitValue(unit, weights)
  }
  return value
}

/**
 * How good this position is for `side`. Positive is winning.
 *
 * Symmetric by construction — `evaluateBoard(state, 'player')` is the exact
 * negation of `evaluateBoard(state, 'enemy')`. That matters more than it
 * looks: an asymmetric evaluator lets a search prefer a line because of who is
 * asking rather than because of what is on the board, and the resulting bugs
 * are almost impossible to see in a game log.
 */
export function evaluateBoard(
  game: GameState,
  side: BattleSide,
  weights: EvalWeights = DEFAULT_EVAL_WEIGHTS,
): number {
  if (game.winner) return game.winner === side ? WIN : LOSS
  return sideValue(game[side], weights) - sideValue(game[otherSide(side)], weights)
}

/**
 * Damage `side` could deal to the opposing hero right now, ignoring blockers.
 *
 * Only useful as a cheap pre-filter — a Guard on the other side means none of
 * it reaches. The search finds real lethal by simulating; this exists so the
 * search can skip work when there is obviously nothing to find.
 */
export function availableFaceDamage(game: GameState, side: BattleSide): number {
  return game[side].board.reduce(
    (total, unit) => total + (unit && !unit.exhausted ? unit.attack : 0),
    0,
  )
}

/**
 * True when the opposing side has a Guard, which forces all attacks into it.
 *
 * Reads through `hasKeyword` rather than `effect` — a unit can be granted Guard
 * at summon time on top of a different primary effect, and checking the field
 * directly misses exactly those. That mistake has already been made once in
 * this repo, in the arena harness, where it quietly made the reference
 * opponent throw units into a wall it could not see.
 */
export function opposingGuardLane(game: GameState, side: BattleSide): number {
  return game[otherSide(side)].board.findIndex((unit) => unit !== null && hasKeyword(unit, 'guard'))
}

/**
 * Sanity bound used by tests: the widest spread the evaluator can produce
 * between two non-terminal positions, so a regression that makes scores
 * explode is caught before it swamps the terminal values.
 */
export function maxPositionalSwing(weights: EvalWeights = DEFAULT_EVAL_WEIGHTS): number {
  const fattestUnit = 12 * weights.attack + 12 * weights.health + weights.guard + weights.evasive
  return 2 * (STARTING_HEALTH * weights.heroHealth
    + BOARD_SIZE * fattestUnit
    + 10 * weights.card
    + 10 * weights.momentum)
}

// ═══════════════════════════════════════════════════════════════════════
// Enemy turn — moved verbatim from game.ts
//
// These decide what the AI plays and where it attacks. They lived in
// game.ts, which is a standing complexity hotspot, and they belong with
// the evaluator they are about to start using. Moving them here also
// keeps the dependency acyclic: the AI imports the engine, and nothing in
// the engine imports the AI.
// ═══════════════════════════════════════════════════════════════════════

function getAIProfile(difficulty: AIDifficulty): AIDifficultyProfile {
  return AI_DIFFICULTY_PROFILES[difficulty] ?? AI_DIFFICULTY_PROFILES.adept
}

function scorePlayableCard(card: CardInstance, profile: AIDifficultyProfile, needsGuard: boolean, lowOnCards: boolean): number {
  let score = card.cost * profile.costWeight + card.attack * profile.attackWeight + card.health * profile.healthWeight
  score += (10 - card.cost) * profile.lowCostBias

  if (card.effect === 'guard') score += needsGuard ? profile.guardNeedWeight : profile.baseGuardWeight
  if (card.effect === 'charge') score += profile.chargeWeight
  if (card.effect === 'draw') score += lowOnCards ? profile.lowHandDrawBonus : profile.drawWeight
  if (card.effect === 'blast' || card.effect === 'poison' || card.effect === 'siphon') score += profile.removalWeight
  if (card.effect === 'summon' || card.effect === 'empower' || card.effect === 'rally') score += profile.boardEngineWeight
  if (card.rarity === 'legendary') score += profile.legendaryWeight

  return score
}

export function highestPlayableIndex(
  hand: CardInstance[],
  mana: number,
  difficulty: AIDifficulty = 'adept',
  game?: GameState,
  side: BattleSide = 'enemy',
): number {
  const affordable = hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.cost <= mana)

  if (!affordable.length) {
    return -1
  }

  const profile = getAIProfile(difficulty)

  if (profile.selectionMode === 'cheapest') {
    affordable.sort((left, right) => left.card.cost - right.card.cost)
    return affordable[0].index
  }

  const actor = game?.[side]
  const needsGuard = actor ? actor.health <= 12 && !boardHasGuard(actor.board) : false
  const lowOnCards = actor ? actor.hand.length <= 2 : false

  let bestIndex = affordable[0].index
  let bestScore = -Infinity

  affordable.forEach(({ card, index }) => {
    let score = scorePlayableCard(card, profile, needsGuard, lowOnCards)

    if (game) {
      if ((game.player.health <= 8 || game.player.board.filter(Boolean).length >= 2) && (card.effect === 'blast' || card.effect === 'poison')) {
        score += profile.removalWeight
      }
      if (game.enemy.board.filter(Boolean).length === 0 && card.effect === 'guard') {
        score += profile.baseGuardWeight
      }
    }

    if (score > bestScore || (score === bestScore && card.cost > hand[bestIndex].cost)) {
      bestIndex = index
      bestScore = score
    }
  })

  return bestIndex
}

export function chooseEnemyTarget(
  game: GameState,
  attacker: Unit,
  difficulty: AIDifficulty = game.aiDifficulty ?? 'adept',
): number | 'hero' {
  const guardLane = game.player.board.findIndex((unit) => unit !== null && hasKeyword(unit, 'guard'))
  if (guardLane !== -1) {
    return guardLane
  }

  if (game.player.health <= attacker.attack) {
    return 'hero'
  }

  const profile = getAIProfile(difficulty)
  const heroPressure = game.enemy.board.reduce((total, unit) => total + (unit && !unit.exhausted ? unit.attack : 0), 0)
  let heroScore = attacker.attack + profile.heroBias + (game.player.health <= heroPressure ? profile.lethalPressureBonus : 0)

  if (profile.selectionMode === 'cheapest') {
    const easyTrade = game.player.board.findIndex((unit) => unit !== null && unit.currentHealth <= attacker.attack)
    return easyTrade !== -1 ? easyTrade : 'hero'
  }

  let bestLane = -1
  let bestScore = -Infinity

  game.player.board.forEach((unit, index) => {
    if (!unit) {
      return
    }

    let score = unit.attack * 2 + unit.currentHealth

    if (unit.currentHealth <= attacker.attack) score += profile.tradeKillWeight
    if (attacker.currentHealth > unit.attack) score += profile.survivalTradeWeight
    if (unit.attack >= attacker.currentHealth) score -= profile.riskyTradePenalty
    if (hasKeyword(unit, 'guard')) score += profile.guardNeedWeight
    if (hasKeyword(unit, 'poison') || hasKeyword(unit, 'lifesteal') || hasKeyword(unit, 'cleave')) score += profile.dangerousKeywordWeight
    if (unit.attack >= 4) score += profile.highAttackThreatWeight

    if (score > bestScore) {
      bestLane = index
      bestScore = score
    }
  })

  if (game.enemy.health < game.player.health) {
    heroScore += profile.comebackHeroBonus
  }

  return bestLane !== -1 && bestScore >= heroScore ? bestLane : 'hero'
}

function shouldEnemyUseBurst(game: GameState, difficulty: AIDifficulty): boolean {
  if (game.enemy.momentum < 3) {
    return false
  }

  if (game.player.health <= 2) {
    return true
  }

  const profile = getAIProfile(difficulty)
  if (game.player.health <= profile.burstHeroThreshold) {
    return true
  }

  const enemyBoardCount = game.enemy.board.filter(Boolean).length
  const playerBoardCount = game.player.board.filter(Boolean).length
  return (profile.burstOnEmptyHand && game.enemy.hand.length === 0)
    || (profile.burstOnBoardDeficit && enemyBoardCount < playerBoardCount)
}

export function runEnemyTurn(base: GameState): GameState {
  if (base.winner) {
    return base
  }

  const difficulty = base.aiDifficulty ?? 'adept'
  let game = passTurn(base)

  if (game.turn !== 'enemy' || game.winner) {
    return game
  }

  if (shouldEnemyUseBurst(game, difficulty)) {
    game = castMomentumBurst(game, 'enemy')
  }

  while (true) {
    const playableIndex = highestPlayableIndex(game.enemy.hand, game.enemy.mana, difficulty, game, 'enemy')
    const boardFull = game.enemy.board.every((slot) => slot !== null)

    if (playableIndex === -1 || boardFull || game.winner) {
      break
    }

    game = playCard(game, 'enemy', playableIndex)
  }

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const attacker = game.enemy.board[index]

    if (!attacker || attacker.exhausted || game.winner) {
      continue
    }

    game = attack(game, 'enemy', index, chooseEnemyTarget(game, attacker, difficulty))
  }

  return game.winner ? game : passTurn(game)
}

export type EnemyStep = { state: GameState; label: string }

export function generateEnemyTurnSteps(base: GameState): EnemyStep[] {
  if (base.winner) return [{ state: base, label: 'Game over' }]

  const difficulty = base.aiDifficulty ?? 'adept'
  const steps: EnemyStep[] = []
  let game = passTurn(base)
  steps.push({ state: game, label: `${game.enemy.name} begins their turn.` })

  if (game.turn !== 'enemy' || game.winner) return steps

  if (shouldEnemyUseBurst(game, difficulty)) {
    game = castMomentumBurst(game, 'enemy')
    steps.push({ state: game, label: `${game.enemy.name} unleashes Momentum Burst!` })
  }

  while (true) {
    const playableIndex = highestPlayableIndex(game.enemy.hand, game.enemy.mana, difficulty, game, 'enemy')
    const boardFull = game.enemy.board.every((slot) => slot !== null)
    if (playableIndex === -1 || boardFull || game.winner) break
    const card = game.enemy.hand[playableIndex]
    game = playCard(game, 'enemy', playableIndex)
    steps.push({ state: game, label: `${game.enemy.name} plays ${card.icon} ${card.name}.` })
  }

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const attacker = game.enemy.board[index]
    if (!attacker || attacker.exhausted || game.winner) continue
    const target = chooseEnemyTarget(game, attacker, difficulty)
    game = attack(game, 'enemy', index, target)
    const targetLabel = target === 'hero' ? 'your hero' : `lane ${target + 1}`
    steps.push({ state: game, label: `${attacker.name} attacks ${targetLabel}!` })
  }

  if (!game.winner) {
    game = passTurn(game)
    steps.push({ state: game, label: 'Your turn begins.' })
  } else {
    steps.push({ state: game, label: game.winner === 'enemy' ? 'Defeat!' : 'Victory!' })
  }

  return steps
}
