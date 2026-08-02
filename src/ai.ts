import {
  BOARD_SIZE,
  STARTING_HEALTH,
  hasKeyword,
  otherSide,
  type BattleSide,
  type GameState,
  type PlayerState,
  type Unit,
} from './game'

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
