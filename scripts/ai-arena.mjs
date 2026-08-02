/**
 * Headless AI measurement.
 *
 *   npm run ai:arena                          # every difficulty, 400 games each
 *   npm run ai:arena -- --games=2000
 *   npm run ai:arena -- --difficulty=legend --verbose
 *   npm run ai:arena -- --decks                # deck shape only, no games
 *
 * The bug report this exists for was "I beat the top difficulty consistently
 * almost immediately". That is a real and useful report, but it cannot be
 * acted on or regression-tested as prose, and neither can any claim I make
 * about having fixed it. This turns both into numbers.
 *
 * Two decisions shape everything here.
 *
 * **The opponent is fixed, and is not the AI.** Measuring the AI against
 * itself is worthless: improve both sides and the win rate sits at 50% while
 * telling you nothing. The reference opponent below is a deliberately simple,
 * unchanging "competent player" policy — curve out, take good trades, go face
 * otherwise. Because it never changes, a win-rate move between two runs is
 * always attributable to the AI.
 *
 * **The reference plays the starter deck.** `DEFAULT_DECK_CONFIG` is what a new
 * account actually owns. A Legend AI that loses to the starter deck is the
 * thing being reported, so that is the matchup that gets measured.
 *
 * Randomness is seeded, so a run is reproducible and two runs of the same build
 * give the same answer.
 */
import process from 'node:process'
import {
  AI_DIFFICULTY_DECKS,
  BOARD_SIZE,
  CARD_LIBRARY,
  DEFAULT_DECK_CONFIG,
  attack,
  castMomentumBurst,
  createGame,
  createPlayer,
  hasKeyword,
  playCard,
} from '../server/game.js'
import { generateEnemyTurnSteps } from '../server/ai.js'

const DIFFICULTIES = ['novice', 'adept', 'veteran', 'legend']
/** A game that reaches this many turns is a stall, not a game; call it a draw. */
const TURN_LIMIT = 60

/**
 * A deck an experienced player would actually build: aggressive tempo, three
 * copies of the best one-drop, charge for reach, removal for the lanes.
 *
 * The starter deck alone is not enough to tune against. Everything above
 * novice beats it around 93%, so the top three difficulties pile up against a
 * ceiling and become indistinguishable — which is exactly the state that let
 * Legend be no harder than Adept without anyone noticing. Separation at the
 * top only becomes visible against an opponent that can punish a bad draw.
 *
 * This is also the closer analogue of the person who filed the report: they
 * beat Legend consistently, and they were not playing the starter deck.
 */
/**
 * A deck an experienced player would actually build: aggressive tempo, three
 * copies of the best one-drop, charge for reach, removal for the lanes.
 *
 * Deliberately holds no Storm Carrion, and that is worth explaining because
 * the first version ran two.
 *
 * Storm Carrion is 3 mana for a 4/2 with Cleave and Charge — it deals four
 * damage to every enemy unit the turn it lands, which on a three-lane board is
 * the whole board, and then attacks. By the project's own balance framework it
 * is at double its legal stat budget: (3*2)+1 = 7, minus 2 for Cleave and 2 for
 * Charge, leaves 3 stats; it is printed with 6.
 *
 * Measured, its presence or absence in a fifteen-card deck swings the win rate
 * by roughly seventy points. A reference built on it is not measuring how well
 * the AI plays, it is measuring who drew the broken card — and the difficulty
 * ladder tuned against it would bake that in. So the yardstick runs a fairly
 * costed body instead, and the card itself is flagged for a balance decision
 * rather than quietly designed around.
 */
const STRONG_REFERENCE_DECK = {
  'spark-imp': 3,
  'blaze-runner': 2,
  'hex-spider': 2,
  'shade-fox': 2,
  'sky-raider': 2,
  'ember-witch': 2,
  'soul-reaver': 2,
  'war-mammoth': 1,
}

const REFERENCE_DECKS = {
  starter: DEFAULT_DECK_CONFIG,
  strong: STRONG_REFERENCE_DECK,
}

// ── Seeded randomness ─────────────────────────────────────────────────────
// The engine shuffles with Math.random. Replacing it for the duration of a run
// makes results reproducible; without that, "win rate moved 4 points" could
// just as easily be the shuffle.

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function withSeed(seed, fn) {
  const real = Math.random
  Math.random = mulberry32(seed)
  try {
    return fn()
  } finally {
    Math.random = real
  }
}

// ── The reference opponent ────────────────────────────────────────────────

// ── The reference opponents ───────────────────────────────────────────────
//
// Two policies, deliberately different in shape. Tuning an AI to beat a single
// fixed opponent produces a champion at exactly one matchup, and this codebase
// has already been caught measuring against one yardstick and believing the
// number: the old ladder looked fine against the starter deck and collapsed
// against a real one. A tempo player and a value player fail in opposite
// directions, so an AI that handles both is more likely to handle a person.
//
// Neither is a champion, and neither is meant to be. They are rulers.

/**
 * Tempo: develop the curve, take good trades, otherwise hit the face.
 *
 * Guard is a rule rather than a preference — the engine rejects anything else
 * while one is up, so it is checked first everywhere below.
 */
function tempoTarget(game, attacker) {
  const guardLane = game.enemy.board.findIndex((unit) => unit !== null && hasKeyword(unit, 'guard'))
  if (guardLane !== -1) return guardLane

  if (game.enemy.health <= attacker.attack) return 'hero'

  let best = -1
  let bestScore = 0
  game.enemy.board.forEach((unit, index) => {
    if (!unit) return
    if (unit.currentHealth > attacker.attack) return
    const survives = attacker.currentHealth > unit.attack
    const score = unit.attack * 2 + unit.currentHealth + (survives ? 6 : 0)
    if ((survives || unit.attack >= attacker.attack) && score > bestScore) {
      best = index
      bestScore = score
    }
  })

  return best === -1 ? 'hero' : best
}

/** Tempo picks the biggest thing the mana allows: curve out, apply pressure. */
function tempoCard(game) {
  let choice = -1
  let choiceCost = -1
  game.player.hand.forEach((card, index) => {
    if (card.cost <= game.player.mana && card.cost > choiceCost) {
      choice = index
      choiceCost = card.cost
    }
  })
  return choice
}

/**
 * Value: keep the board, refuse bad trades, win later.
 *
 * Returns `null` to mean "do not attack at all", which tempo never does. That
 * is the whole point of having it — an AI that races well can still be
 * hopeless against someone content to sit behind blockers, and a single
 * aggressive reference would never reveal that.
 */
function valueTarget(game, attacker) {
  const guardLane = game.enemy.board.findIndex((unit) => unit !== null && hasKeyword(unit, 'guard'))
  if (guardLane !== -1) return guardLane

  if (game.enemy.health <= attacker.attack) return 'hero'

  // Only trades that come out ahead: kill it and live.
  let best = -1
  let bestScore = 0
  game.enemy.board.forEach((unit, index) => {
    if (!unit) return
    if (unit.currentHealth > attacker.attack) return
    if (attacker.currentHealth <= unit.attack) return
    const score = unit.attack * 2 + unit.currentHealth
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  if (best !== -1) return best

  // Nothing worth trading with: hit the face only when unopposed.
  return game.enemy.board.every((unit) => unit === null) ? 'hero' : null
}

/** Value prefers durable bodies and blockers over raw cost. */
function valueCard(game) {
  let choice = -1
  let choiceScore = -Infinity
  game.player.hand.forEach((card, index) => {
    if (card.cost > game.player.mana) return
    const score = card.health * 2 + card.attack + (card.effect === 'guard' ? 6 : 0)
    if (score > choiceScore) {
      choice = index
      choiceScore = score
    }
  })
  return choice
}

const REFERENCE_POLICIES = {
  tempo: { chooseCard: tempoCard, chooseTarget: tempoTarget },
  value: { chooseCard: valueCard, chooseTarget: valueTarget },
}

/**
 * One reference turn: develop, then attack.
 *
 * Every action goes through the engine's own functions and is kept only if the
 * state actually changed, so an illegal choice degrades to "skip" rather than
 * desyncing the simulation.
 */
function playReferenceTurn(startState, policy) {
  let game = startState

  // Burst only when it finishes the job — a person holds it otherwise.
  if (game.player.momentum >= 3 && game.enemy.health <= 3) {
    const after = castMomentumBurst(game, 'player')
    if (after !== game) game = after
  }

  for (let guard = 0; guard < 8; guard += 1) {
    if (game.winner) break
    if (game.player.board.every((slot) => slot !== null)) break

    const choice = policy.chooseCard(game)
    if (choice === -1) break

    const after = playCard(game, 'player', choice)
    if (after === game) break
    game = after
  }

  for (let lane = 0; lane < BOARD_SIZE; lane += 1) {
    if (game.winner) break
    const attacker = game.player.board[lane]
    if (!attacker || attacker.exhausted) continue

    const target = policy.chooseTarget(game, attacker)
    if (target === null) continue

    let after = attack(game, 'player', lane, target)
    if (after === game && target !== 'hero') after = attack(game, 'player', lane, 'hero')
    if (after !== game) game = after
  }

  // Deliberately does NOT pass the turn. `generateEnemyTurnSteps` opens with
  // its own `passTurn`, so ending here would hand the AI two begin-turns per
  // round — double mana and double draws. game-room.js avoids the same trap by
  // keeping the pre-transition state in `pendingAiTurnBase`; this mirrors it.
  return game
}

/**
 * @returns {{winner: string, turns: number, aiFirstPlayTurn: number|null, aiManaWasted: number}}
 */
function playGame(
  difficulty,
  deckSource = difficulty,
  referenceDeck = DEFAULT_DECK_CONFIG,
  policy = REFERENCE_POLICIES.tempo,
) {
  let game = createGame('ai', referenceDeck, 'Nemesis AI', difficulty)
  // Deck and reasoning are separate levers, and a single win rate cannot tell
  // you which one is costing games. Playing a difficulty's weights against
  // another difficulty's deck separates them in one measurement.
  if (deckSource !== difficulty) {
    game = { ...game, enemy: createPlayer('Nemesis AI', AI_DIFFICULTY_DECKS[deckSource]) }
  }
  let turns = 0
  let aiFirstPlayTurn = null
  let aiManaWasted = 0
  let aiTurns = 0

  while (!game.winner && turns < TURN_LIMIT) {
    turns += 1

    game = playReferenceTurn(game, policy)
    if (game.winner) break

    // generateEnemyTurnSteps owns the whole AI turn including the transition
    // into it and back out, exactly as game-room.js drives it in production.
    // It is handed a state whose turn is still 'player' for that reason.
    const before = game
    const beforeBoard = before.enemy.board.filter(Boolean).length
    const steps = generateEnemyTurnSteps(game)
    const after = steps.at(-1)?.state
    if (!after || after === before) break
    game = after
    aiTurns += 1

    const played = game.enemy.board.filter(Boolean).length > beforeBoard
      || steps.some((step) => step.label.includes('plays'))
    if (played && aiFirstPlayTurn === null) aiFirstPlayTurn = aiTurns
    // Mana left on the table at the end of the AI's turn: the efficiency signal.
    const midTurn = steps.at(-2)?.state ?? game
    aiManaWasted += Math.max(0, midTurn.enemy.mana)
  }

  return {
    winner: game.winner ?? 'draw',
    turns,
    aiFirstPlayTurn,
    aiManaWasted: aiTurns > 0 ? aiManaWasted / aiTurns : 0,
  }
}

// ── Deck shape ────────────────────────────────────────────────────────────

/**
 * The static half of the answer: what each deck can physically do.
 *
 * A deck that cannot act before turn three loses on a three-lane board with a
 * 24-point clock regardless of how well the AI plays it, so this is measured
 * separately from win rate — otherwise a deck problem and a reasoning problem
 * look identical in the results.
 */
function deckShape(config) {
  const byId = new Map(CARD_LIBRARY.map((card) => [card.id, card]))
  const cards = []
  for (const [id, count] of Object.entries(config)) {
    const card = byId.get(id)
    if (!card) throw new Error(`deck references unknown card "${id}"`)
    for (let i = 0; i < count; i += 1) cards.push(card)
  }

  const total = cards.length
  const avgCost = cards.reduce((sum, card) => sum + card.cost, 0) / total
  const singletons = Object.values(config).filter((n) => n === 1).length
  const byT3 = cards.filter((card) => card.cost <= 3).length

  /**
   * Deliberately NOT "chance of an opening hand with no early play".
   *
   * That number is easy to compute and wrong to act on: `createPlayer` runs
   * `ensurePlayableOpeningHand`, which swaps a 1-cost card out of the deck into
   * the opening hand whenever the hand has none. So every deck holding a single
   * 1-drop opens with it, and a hypergeometric "dead opening" figure describes a
   * deck that the engine never actually deals. It said 33% for legend; measured
   * games put legend's first play on turn 1.00, every time.
   *
   * What still bites is the turns *after* the guaranteed opener, so the useful
   * figure is how much of the deck can be cast by turn three at all.
   */
  const curve = {}
  for (const card of cards) curve[card.cost] = (curve[card.cost] ?? 0) + 1

  return { total, distinct: Object.keys(config).length, singletons, avgCost, byT3, curve }
}

// ── Reporting ─────────────────────────────────────────────────────────────

function formatCurve(curve) {
  return Object.keys(curve)
    .map(Number)
    .sort((a, b) => a - b)
    .map((cost) => `${cost}:${curve[cost]}`)
    .join(' ')
}

function reportDecks() {
  console.log('\nDeck shape')
  console.log('  difficulty  cards  singles  avg cost  castable by T3  curve')
  for (const difficulty of DIFFICULTIES) {
    const shape = deckShape(AI_DIFFICULTY_DECKS[difficulty])
    console.log(
      `  ${difficulty.padEnd(11)}${String(shape.total).padStart(4)}`
      + `${String(shape.singletons).padStart(9)}`
      + `${shape.avgCost.toFixed(2).padStart(10)}`
      + `${`${Math.round((shape.byT3 / shape.total) * 100)}%`.padStart(16)}   ${formatCurve(shape.curve)}`,
    )
  }
}

/**
 * The ladder against every reference: two policies × two decks.
 *
 * One column is never enough. The starter deck cannot tell the top three
 * difficulties apart, the strong deck flatters nobody at the bottom, and a
 * purely aggressive reference would never reveal an AI that cannot beat
 * someone sitting behind blockers. A ladder is only real if it climbs in every
 * column.
 */
function reportGames(games, only) {
  const targets = only ? [only] : DIFFICULTIES
  const columns = []
  for (const policy of Object.keys(REFERENCE_POLICIES)) {
    for (const deck of Object.keys(REFERENCE_DECKS)) columns.push({ policy, deck })
  }

  console.log(`\nAI win % vs each reference — ${games} games per cell, seeded`)
  console.log(`  ${'difficulty'.padEnd(12)}${columns.map(({ policy, deck }) => `${policy}/${deck}`.padStart(15)).join('')}`)

  const rows = []
  for (const difficulty of targets) {
    const cells = []
    for (const { policy, deck } of columns) {
      let wins = 0
      for (let i = 0; i < games; i += 1) {
        const result = withSeed(i + 1, () => playGame(
          difficulty, difficulty, REFERENCE_DECKS[deck], REFERENCE_POLICIES[policy],
        ))
        if (result.winner === 'enemy') wins += 1
      }
      cells.push((wins / games) * 100)
    }
    rows.push({ difficulty, cells })
    console.log(`  ${difficulty.padEnd(12)}${cells.map((n) => `${n.toFixed(1)}%`.padStart(15)).join('')}`)
  }

  if (only) return rows

  // The ladder has to climb in every column, not on average.
  const inversions = []
  columns.forEach(({ policy, deck }, column) => {
    for (let i = 1; i < rows.length; i += 1) {
      const here = rows[i].cells[column]
      const below = rows[i - 1].cells[column]
      if (here < below - 0.001) {
        inversions.push(`${policy}/${deck}: ${rows[i].difficulty} (${here.toFixed(1)}%) `
          + `is weaker than ${rows[i - 1].difficulty} (${below.toFixed(1)}%)`)
      }
    }
  })

  if (inversions.length) {
    console.log('\n  Ladder inversions:')
    for (const line of inversions) console.log(`    ✗ ${line}`)
  } else {
    console.log('\n  Ladder climbs in every column.')
  }
  return rows
}

/**
 * Every difficulty's weights against every difficulty's deck.
 *
 * A single win rate per difficulty conflates two independent levers. Reading
 * down a column shows what a deck is worth regardless of who pilots it;
 * reading across a row shows what the reasoning is worth regardless of what it
 * is holding. Whichever axis moves more is the one to fix first.
 */
function reportMatrix(games) {
  console.log(`\nWeights (rows) × deck (columns) — AI win %, ${games} games each`)
  console.log(`  ${''.padEnd(12)}${DIFFICULTIES.map((d) => d.padStart(9)).join('')}`)

  const rows = []
  for (const weights of DIFFICULTIES) {
    const cells = []
    for (const deck of DIFFICULTIES) {
      let wins = 0
      for (let i = 0; i < games; i += 1) {
        // Against the strong tempo reference. The starter deck saturates —
        // every capable difficulty beats it ~100% — so a matrix measured there
        // reads as all-ones and separates nothing.
        const result = withSeed(i + 1, () => playGame(
          weights, deck, REFERENCE_DECKS.strong, REFERENCE_POLICIES.tempo,
        ))
        if (result.winner === 'enemy') wins += 1
      }
      cells.push((wins / games) * 100)
    }
    rows.push({ weights, cells })
    console.log(`  ${weights.padEnd(12)}${cells.map((n) => `${n.toFixed(1)}%`.padStart(9)).join('')}`)
  }

  // Which lever actually moves the result?
  const spread = (values) => Math.max(...values) - Math.min(...values)
  const deckSpread = spread(DIFFICULTIES.map((_, column) =>
    rows.reduce((sum, row) => sum + row.cells[column], 0) / rows.length))
  const weightSpread = spread(rows.map((row) => row.cells.reduce((a, b) => a + b, 0) / row.cells.length))
  console.log(`\n  Deck choice moves the win rate by ${deckSpread.toFixed(1)} points on average.`)
  console.log(`  Weight choice moves it by ${weightSpread.toFixed(1)} points.`)
}

function main() {
  const args = process.argv.slice(2)
  const value = (name, fallback) => {
    const hit = args.find((arg) => arg.startsWith(`--${name}=`))
    return hit ? hit.split('=')[1] : fallback
  }

  const games = Number(value('games', 400))
  const only = value('difficulty', null)
  if (only && !DIFFICULTIES.includes(only)) {
    throw new Error(`Unknown difficulty "${only}". Known: ${DIFFICULTIES.join(', ')}`)
  }

  reportDecks()
  if (!args.includes('--decks')) reportGames(games, only)
  if (args.includes('--matrix')) reportMatrix(games)
  console.log('')
}

main()
