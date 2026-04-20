export type GameMode = 'ai' | 'duel'
export type AIDifficulty = 'novice' | 'adept' | 'veteran' | 'legend'
export type BattleSide = 'player' | 'enemy'
export type CardEffect = 'charge' | 'guard' | 'rally' | 'blast' | 'heal' | 'draw' | 'fury' | 'drain' | 'empower' | 'poison' | 'shield' | 'siphon' | 'bolster' | 'cleave' | 'lifesteal' | 'summon' | 'silence' | 'frostbite' | 'enrage' | 'deathrattle' | 'overwhelm'
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type CardTribe = 'beast' | 'elemental' | 'undead' | 'dragon' | 'mech' | 'arcane' | 'warrior' | 'nature' | 'demon' | 'none'
export type Winner = BattleSide | 'draw' | null
export type DeckConfig = Record<string, number>

export type CardTemplate = {
  id: string
  name: string
  cost: number
  attack: number
  health: number
  icon: string
  text: string
  effect?: CardEffect
  rarity: CardRarity
  tribe: CardTribe
}

export type CardInstance = CardTemplate & {
  instanceId: string
}

export type Unit = CardInstance & {
  uid: string
  currentHealth: number
  exhausted: boolean
  /**
   * Extra keywords granted to this unit at summon time on top of `effect`.
   * Used so a card whose primary keyword is e.g. `'frostbite'` can also
   * behave like a `'guard'` (Glacial Colossus, Zephyr) without losing its
   * primary on-play effect classification.
   */
  keywords?: CardEffect[]
}

/**
 * Returns true if a unit has the given keyword either as its primary
 * `effect` or in its summon-time `keywords` list. Use this everywhere
 * combat behaviour or board-state checks need to match a keyword instead
 * of comparing `unit.effect` directly — that way cards with multiple
 * keywords (Charge + Lifesteal, Frostbite + Guard, …) work correctly.
 */
export function hasKeyword(unit: Unit, kind: CardEffect): boolean {
  if (unit.effect === kind) return true
  return Boolean(unit.keywords?.includes(kind))
}

export type PlayerState = {
  name: string
  health: number
  mana: number
  maxMana: number
  momentum: number
  deck: CardInstance[]
  hand: CardInstance[]
  board: Array<Unit | null>
}

export type GameState = {
  mode: GameMode
  aiDifficulty: AIDifficulty
  player: PlayerState
  enemy: PlayerState
  turn: BattleSide
  turnNumber: number
  log: string[]
  winner: Winner
}

export const BOARD_SIZE = 3
export const STARTING_HEALTH = 24
export const STARTING_HAND = 3
export const MIN_DECK_SIZE = 10
export const MAX_DECK_SIZE = 16
export const MAX_COPIES = 3
export const MAX_LEGENDARY_COPIES = 1

export const RARITY_COLORS: Record<CardRarity, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
}

export const CARD_LIBRARY: CardTemplate[] = [
  // ═══════════════════════════════════════════════════════════════════
  // COMMON (28 cards) — Core roster of lesser horrors and cultists
  // ═══════════════════════════════════════════════════════════════════
  { id: 'spark-imp', name: 'Crawling Spark', cost: 1, attack: 2, health: 1, icon: '⚡', text: 'A stuttering arc from beyond the veil.', rarity: 'common', tribe: 'elemental' },
  { id: 'tide-caller', name: 'Abyssal Caller', cost: 1, attack: 1, health: 2, icon: '🌊', text: 'Bolster: whisper +1 health into a random ally on summon.', effect: 'bolster', rarity: 'common', tribe: 'elemental' },
  { id: 'cave-bat', name: 'Cavern Fluke', cost: 1, attack: 1, health: 1, icon: '🦇', text: 'Charge: slips through the crack between worlds.', effect: 'charge', rarity: 'common', tribe: 'beast' },
  { id: 'copper-automaton', name: 'Brass Husk', cost: 1, attack: 1, health: 3, icon: '⚙️', text: 'A hollow vessel that will not stop walking.', rarity: 'common', tribe: 'mech' },
  { id: 'shade-fox', name: 'Pallid Fox', cost: 2, attack: 2, health: 2, icon: '🦊', text: 'Fury: grows bolder after tasting blood (+1 attack after surviving combat).', effect: 'fury', rarity: 'common', tribe: 'beast' },
  { id: 'ironbark-guard', name: 'Bone Fence Sentinel', cost: 2, attack: 1, health: 4, icon: '🛡️', text: 'Guard: must be attacked first. It remembers every trespass.', effect: 'guard', rarity: 'common', tribe: 'nature' },
  { id: 'dawn-healer', name: 'Pallid Mender', cost: 2, attack: 1, health: 3, icon: '🕯️', text: 'Restore 2 health to your hero on summon.', effect: 'heal', rarity: 'common', tribe: 'arcane' },
  { id: 'blaze-runner', name: 'Ember Herald', cost: 2, attack: 3, health: 1, icon: '🔥', text: 'Charge: burns out fast. Glass wick.', effect: 'charge', rarity: 'common', tribe: 'elemental' },
  { id: 'void-leech', name: 'Thought-Leech', cost: 2, attack: 2, health: 2, icon: '🩸', text: 'Drain: steal 1 Momentum from the enemy on summon.', effect: 'drain', rarity: 'common', tribe: 'demon' },
  { id: 'bog-lurker', name: 'Marsh Lurker', cost: 2, attack: 2, health: 3, icon: '🐸', text: 'Something older than the mire itself.', rarity: 'common', tribe: 'beast' },
  { id: 'militia-recruit', name: 'Cult Acolyte', cost: 2, attack: 2, health: 2, icon: '🕯️', text: 'Rally: gain 1 Momentum on summon. Their chants stir the Dread.', effect: 'rally', rarity: 'common', tribe: 'warrior' },
  { id: 'rust-golem', name: 'Corroded Husk', cost: 2, attack: 1, health: 5, icon: '🔩', text: 'Guard: must be attacked first.', effect: 'guard', rarity: 'common', tribe: 'mech' },
  { id: 'rune-scholar', name: 'Glyph Scholar', cost: 3, attack: 2, health: 3, icon: '📖', text: 'Rally: gain 1 Momentum on summon. Knowledge has a price.', effect: 'rally', rarity: 'common', tribe: 'arcane' },
  { id: 'sky-raider', name: 'Wind-Stalker', cost: 3, attack: 3, health: 2, icon: '🪽', text: 'Charge: drops from the starless sky.', effect: 'charge', rarity: 'common', tribe: 'warrior' },
  { id: 'thornback-boar', name: 'Bristle Beast', cost: 3, attack: 3, health: 3, icon: '🐗', text: 'Fury: gains +1 attack after surviving combat.', effect: 'fury', rarity: 'common', tribe: 'beast' },
  { id: 'wind-sprite', name: 'Mist Wraith', cost: 3, attack: 2, health: 2, icon: '💨', text: 'Draw a card on summon. The fog reveals what was hidden.', effect: 'draw', rarity: 'common', tribe: 'nature' },
  { id: 'granite-sentinel', name: 'Obelisk Sentinel', cost: 3, attack: 2, health: 4, icon: '🗿', text: 'Guard: must be attacked first. Carved with forbidden sigils.', effect: 'guard', rarity: 'common', tribe: 'elemental' },
  { id: 'fire-imp', name: 'Ember Imp', cost: 3, attack: 3, health: 2, icon: '👹', text: 'Blast: deal 1 to the opposing hero.', effect: 'blast', rarity: 'common', tribe: 'demon' },
  { id: 'field-medic', name: 'Battle Mender', cost: 3, attack: 2, health: 3, icon: '⛑️', text: 'Restore 3 health to your hero on summon.', effect: 'heal', rarity: 'common', tribe: 'warrior' },
  { id: 'sand-elemental', name: 'Dust Horror', cost: 4, attack: 3, health: 4, icon: '🏜️', text: 'Bolster: give a random friendly unit +1 health.', effect: 'bolster', rarity: 'common', tribe: 'elemental' },
  { id: 'pack-wolf', name: 'Starving Pack', cost: 4, attack: 4, health: 3, icon: '🐺', text: 'Empower: every ally bares its teeth (+1 attack on summon).', effect: 'empower', rarity: 'common', tribe: 'beast' },
  { id: 'clockwork-knight', name: 'Geared Thrall', cost: 4, attack: 4, health: 5, icon: '⚙️', text: 'Reliable mid-game thrall. The gears whisper.', rarity: 'common', tribe: 'mech' },
  { id: 'storm-brute', name: 'Thunderous Colossus', cost: 5, attack: 5, health: 6, icon: '⛈️', text: 'A tall, wrong-angled thing that closes games fast.', rarity: 'common', tribe: 'elemental' },
  { id: 'siege-turtle', name: 'Carapace Wyrm', cost: 5, attack: 2, health: 8, icon: '🐢', text: 'Guard: must be attacked first. Its shell is older than the city.', effect: 'guard', rarity: 'common', tribe: 'beast' },
  { id: 'flame-juggler', name: 'Fire-Eater Cultist', cost: 4, attack: 3, health: 4, icon: '🔥', text: 'Blast: deal 1 to the opposing hero.', effect: 'blast', rarity: 'common', tribe: 'elemental' },
  { id: 'highland-archer', name: 'Barrow Archer', cost: 3, attack: 3, health: 2, icon: '🏹', text: 'Poison: deal 1 damage to all enemy units on summon. Tipped with grave-dust.', effect: 'poison', rarity: 'common', tribe: 'warrior' },
  { id: 'moss-treant', name: 'Fungal Treant', cost: 5, attack: 4, health: 5, icon: '🍄', text: 'Heal 2 to your hero on summon. Its spores mend and madden.', effect: 'heal', rarity: 'common', tribe: 'nature' },
  { id: 'coral-guardian', name: 'Coral Bastion', cost: 4, attack: 2, health: 5, icon: '🪸', text: 'Shield: give your hero +2 armor on summon.', effect: 'shield', rarity: 'common', tribe: 'nature' },

  // ═══════════════════════════════════════════════════════════════════
  // RARE (22 cards) — Stronger horrors, harder to coax from the deep
  // ═══════════════════════════════════════════════════════════════════
  { id: 'moonwell-sage', name: 'Pale Moon Seer', cost: 4, attack: 2, health: 4, icon: '🌙', text: 'Draw a card on summon.', effect: 'draw', rarity: 'rare', tribe: 'arcane' },
  { id: 'ember-witch', name: 'Ashen Witch', cost: 4, attack: 3, health: 4, icon: '🕯️', text: 'Blast: deal 2 to the opposing hero.', effect: 'blast', rarity: 'rare', tribe: 'arcane' },
  { id: 'venom-drake', name: 'Venomous Serpent-Kin', cost: 3, attack: 2, health: 4, icon: '🐍', text: 'Poison: deal 1 damage to all enemy units on summon.', effect: 'poison', rarity: 'rare', tribe: 'dragon' },
  { id: 'warcry-sentinel', name: 'Ululating Sentinel', cost: 3, attack: 2, health: 3, icon: '📯', text: 'Empower: its shriek emboldens every ally (+1 attack on summon).', effect: 'empower', rarity: 'rare', tribe: 'warrior' },
  { id: 'aegis-knight', name: 'Ward-Knight', cost: 4, attack: 3, health: 5, icon: '⚜️', text: 'Shield: give your hero +3 armor on summon.', effect: 'shield', rarity: 'rare', tribe: 'warrior' },
  { id: 'soul-reaver', name: 'Soul Harvester', cost: 4, attack: 4, health: 3, icon: '💀', text: 'Siphon: deal 2 to enemy hero, heal self for 2.', effect: 'siphon', rarity: 'rare', tribe: 'undead' },
  { id: 'crystal-golem', name: 'Geode Colossus', cost: 5, attack: 3, health: 8, icon: '💎', text: 'Guard: must be attacked first. Grown in a place with no sky.', effect: 'guard', rarity: 'rare', tribe: 'elemental' },
  { id: 'runebound-oracle', name: 'Hollow Oracle', cost: 3, attack: 1, health: 4, icon: '🔮', text: 'Draw 2 cards on summon. The hollow speaks of futures.', effect: 'draw', rarity: 'rare', tribe: 'arcane' },
  { id: 'frost-weaver', name: 'Rime Weaver', cost: 3, attack: 2, health: 3, icon: '❄️', text: 'Frostbite: freeze an enemy unit (exhausted next turn).', effect: 'frostbite', rarity: 'rare', tribe: 'elemental' },
  { id: 'crimson-berserker', name: 'Blood-Maddened Zealot', cost: 4, attack: 5, health: 3, icon: '🪓', text: 'Enrage: gains +2 attack when damaged.', effect: 'enrage', rarity: 'rare', tribe: 'warrior' },
  { id: 'ghost-knight', name: 'Shade Knight', cost: 3, attack: 3, health: 3, icon: '👻', text: 'Deathrattle: deal 2 damage to the enemy hero when destroyed.', effect: 'deathrattle', rarity: 'rare', tribe: 'undead' },
  { id: 'war-mammoth', name: 'Chitinous Behemoth', cost: 5, attack: 5, health: 5, icon: '🦣', text: 'Overwhelm: excess damage crashes into the enemy hero.', effect: 'overwhelm', rarity: 'rare', tribe: 'beast' },
  { id: 'thunder-hawk', name: 'Storm Carrion', cost: 3, attack: 4, health: 2, icon: '🦅', text: 'Charge and Cleave: scatters flesh across adjacent lanes.', effect: 'cleave', rarity: 'rare', tribe: 'beast' },
  { id: 'hex-spider', name: 'Weaver of Ill Omen', cost: 2, attack: 2, health: 3, icon: '🕷️', text: 'Poison: deal 1 to all enemy units on summon.', effect: 'poison', rarity: 'rare', tribe: 'beast' },
  { id: 'iron-clad', name: 'Iron-Clad Devotee', cost: 5, attack: 4, health: 6, icon: '🏰', text: 'Guard: must be attacked first. Shield: +2 armor.', effect: 'guard', rarity: 'rare', tribe: 'mech' },
  { id: 'shadow-dancer', name: 'Umbral Dancer', cost: 4, attack: 4, health: 3, icon: '🌑', text: 'Lifesteal: heal your hero for damage dealt.', effect: 'lifesteal', rarity: 'rare', tribe: 'undead' },
  { id: 'arcane-artificer', name: 'Occult Artificer', cost: 3, attack: 2, health: 4, icon: '🧪', text: 'Summon: conjure a 1/1 Wisp on summon.', effect: 'summon', rarity: 'rare', tribe: 'arcane' },
  { id: 'vine-lasher', name: 'Vine Horror', cost: 4, attack: 3, health: 4, icon: '🌿', text: 'Poison: deal 2 to all enemy units on summon.', effect: 'poison', rarity: 'rare', tribe: 'nature' },
  { id: 'storm-shaman', name: 'Tempest Cultist', cost: 5, attack: 3, health: 5, icon: '🌩️', text: 'Blast: deal 3 to the opposing hero.', effect: 'blast', rarity: 'rare', tribe: 'elemental' },
  { id: 'bone-collector', name: 'Ossuary Collector', cost: 4, attack: 3, health: 4, icon: '🦴', text: 'Drain: steal 2 Momentum from the enemy on summon.', effect: 'drain', rarity: 'rare', tribe: 'undead' },
  { id: 'lava-hound', name: 'Magma Hound', cost: 5, attack: 4, health: 5, icon: '🌋', text: 'Deathrattle: deal 3 damage to all enemy units when destroyed.', effect: 'deathrattle', rarity: 'rare', tribe: 'elemental' },
  { id: 'bronze-drake', name: 'Brazen Wyrm', cost: 4, attack: 4, health: 4, icon: '🐲', text: 'Draw a card on summon.', effect: 'draw', rarity: 'rare', tribe: 'dragon' },

  // ═══════════════════════════════════════════════════════════════════
  // EPIC (14 cards) — Powerful horrors, build-around entities
  // ═══════════════════════════════════════════════════════════════════
  { id: 'nether-witch', name: 'Void Witch', cost: 5, attack: 4, health: 5, icon: '🌀', text: 'Blast: deal 2 to the opposing hero. Draw a card.', effect: 'blast', rarity: 'epic', tribe: 'arcane' },
  { id: 'sunforged-giant', name: 'Hollow-Sun Giant', cost: 6, attack: 6, health: 7, icon: '☀️', text: 'A vast finisher that eclipses the board.', rarity: 'epic', tribe: 'elemental' },
  { id: 'abyssal-tyrant', name: 'Deep Tyrant', cost: 6, attack: 5, health: 6, icon: '🦑', text: 'Silence: strip effects from enemy units. Blast: deal 2.', effect: 'silence', rarity: 'epic', tribe: 'demon' },
  { id: 'phoenix-ascendant', name: 'Ashborn Reborn', cost: 6, attack: 5, health: 5, icon: '🪶', text: 'Charge. Deathrattle: deal 3 to enemy hero on death.', effect: 'charge', rarity: 'epic', tribe: 'elemental' },
  { id: 'glacial-colossus', name: 'Rimebound Colossus', cost: 7, attack: 4, health: 10, icon: '🏔️', text: 'Guard. Frostbite: freeze all enemy units on summon.', effect: 'frostbite', rarity: 'epic', tribe: 'elemental' },
  { id: 'blood-queen', name: 'Crimson Matron', cost: 6, attack: 5, health: 5, icon: '🧛', text: 'Lifesteal. Siphon: deal 3 to enemy hero, heal for 3.', effect: 'siphon', rarity: 'epic', tribe: 'undead' },
  { id: 'iron-juggernaut', name: 'Iron Juggernaut', cost: 7, attack: 7, health: 7, icon: '🦾', text: 'Overwhelm: excess damage hits the enemy hero.', effect: 'overwhelm', rarity: 'epic', tribe: 'mech' },
  { id: 'ancient-hydra', name: 'Many-Mawed Horror', cost: 6, attack: 4, health: 6, icon: '🐙', text: 'Cleave: lashes every lane. Fury.', effect: 'cleave', rarity: 'epic', tribe: 'beast' },
  { id: 'void-empress', name: 'Starless Queen', cost: 6, attack: 4, health: 5, icon: '🌌', text: 'Empower: all friendly units gain +2 attack on summon.', effect: 'empower', rarity: 'epic', tribe: 'demon' },
  { id: 'storm-titan', name: 'Storm Herald', cost: 7, attack: 6, health: 6, icon: '⛈️', text: 'Blast: deal 3 to enemy hero. Draw a card.', effect: 'blast', rarity: 'epic', tribe: 'elemental' },
  { id: 'necro-sage', name: 'Charnel Sage', cost: 5, attack: 3, health: 5, icon: '☠️', text: 'Summon: fill empty lanes with 2/2 Ghoul tokens.', effect: 'summon', rarity: 'epic', tribe: 'undead' },
  { id: 'druid-elder', name: 'Verdant Elder', cost: 5, attack: 3, health: 6, icon: '🌿', text: 'Heal 4 to hero. Bolster all friendly units +1 health.', effect: 'heal', rarity: 'epic', tribe: 'nature' },
  { id: 'shadow-assassin', name: 'Whispering Assassin', cost: 5, attack: 5, health: 3, icon: '🗡️', text: 'Charge. Lifesteal: heal for damage dealt.', effect: 'charge', rarity: 'epic', tribe: 'undead' },
  { id: 'arcane-golem', name: 'Runic Husk', cost: 6, attack: 5, health: 5, icon: '🔮', text: 'Rally: gain 3 Momentum on summon. Draw 1.', effect: 'rally', rarity: 'epic', tribe: 'arcane' },

  // ═══════════════════════════════════════════════════════════════════
  // LEGENDARY (6 cards) — Named horrors, one-per-deck, world-ending
  // ═══════════════════════════════════════════════════════════════════
  { id: 'drakarion-the-eternal', name: 'Drakarion, the Fathomless', cost: 8, attack: 8, health: 8, icon: '🐉', text: 'Charge. Cleave all lanes. The leviathan wakes.', effect: 'charge', rarity: 'legendary', tribe: 'dragon' },
  { id: 'zephyr-world-breaker', name: 'Zephyr, the Whispering Gale', cost: 9, attack: 7, health: 10, icon: '🌪️', text: 'Guard. Frostbite all enemies. Blast: 4 to hero.', effect: 'frostbite', rarity: 'legendary', tribe: 'elemental' },
  { id: 'velara-the-lifebinder', name: 'Velara, the Mycelial', cost: 8, attack: 5, health: 9, icon: '🍄', text: 'Heal hero to full. Empower: all units gain +2 attack.', effect: 'heal', rarity: 'legendary', tribe: 'nature' },
  { id: 'malachar-the-undying', name: 'Malachar, the Carrion King', cost: 8, attack: 6, health: 7, icon: '💀', text: 'Silence all enemies. Summon a 3/3 Wraith in each lane.', effect: 'silence', rarity: 'legendary', tribe: 'undead' },
  { id: 'kronos-the-forgemaster', name: 'Kronos, the Ironclad Heretic', cost: 9, attack: 8, health: 8, icon: '⚒️', text: 'Empower: all units gain +3 attack. Shield hero: +5 armor.', effect: 'empower', rarity: 'legendary', tribe: 'mech' },
  { id: 'aethon-runekeeper', name: 'Aethon, the Starless Oracle', cost: 7, attack: 5, health: 6, icon: '📜', text: 'Draw 3 cards. Rally: gain 3 Momentum. The oracle speaks of ruin.', effect: 'draw', rarity: 'legendary', tribe: 'arcane' },
]

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  'spark-imp': 2,
  'shade-fox': 1,
  'ironbark-guard': 1,
  'dawn-healer': 1,
  'rune-scholar': 1,
  'sky-raider': 2,
  'moonwell-sage': 1,
  'ember-witch': 1,
  'void-leech': 1,
  'venom-drake': 1,
  'tide-caller': 1,
}

export const AI_DECK_CONFIG: DeckConfig = {
  'spark-imp': 1,
  'blaze-runner': 2,
  'cave-bat': 1,
  'shade-fox': 1,
  'ironbark-guard': 1,
  'warcry-sentinel': 1,
  'sky-raider': 1,
  'soul-reaver': 1,
  'ember-witch': 1,
  'frost-weaver': 1,
  'crimson-berserker': 1,
  'storm-brute': 1,
}

export const AI_DIFFICULTY_DECKS: Record<AIDifficulty, DeckConfig> = {
  novice: {
    'spark-imp': 2,
    'copper-automaton': 2,
    'bog-lurker': 2,
    'militia-recruit': 2,
    'rust-golem': 1,
    'fire-imp': 1,
    'storm-brute': 1,
  },
  adept: AI_DECK_CONFIG,
  veteran: {
    'spark-imp': 2,
    'shade-fox': 2,
    'ironbark-guard': 1,
    'warcry-sentinel': 1,
    'ember-witch': 1,
    'moonwell-sage': 1,
    'venom-drake': 1,
    'soul-reaver': 1,
    'frost-weaver': 1,
    'storm-shaman': 1,
    'war-mammoth': 1,
    'pack-wolf': 1,
  },
  legend: {
    'spark-imp': 1,
    'shade-fox': 1,
    'ironbark-guard': 1,
    'warcry-sentinel': 1,
    'ember-witch': 1,
    'soul-reaver': 1,
    'venom-drake': 1,
    'storm-shaman': 1,
    'war-mammoth': 1,
    'shadow-assassin': 1,
    'ancient-hydra': 1,
    'void-empress': 1,
    'storm-titan': 1,
    'arcane-golem': 1,
  },
}

// ─── Card effect data tables ────────────────────────────────────────
//
// Per-card overrides for on-play effect amounts, secondary effects,
// summon-time bonus keywords, and deathrattle behaviours. This is the
// single source of truth for everything that varies card-to-card; the
// resolver in `playCard` reads from here instead of using ad-hoc
// `card.id === '...'` checks. Add a new card override here rather than
// touching the resolver itself.

type DeathrattleSpec =
  | { kind: 'damage-hero'; amount: number }
  | { kind: 'damage-all-enemy-units'; amount: number }

type SummonSpec = {
  id: string
  name: string
  icon: string
  attack: number
  health: number
}

type CardParams = {
  /** Override the default amount of the card's primary effect keyword. */
  amount?: number
  /** Additional on-play keyword effects (resolved after the primary). */
  extras?: Array<{ kind: CardEffect; amount?: number }>
  /** Heal-to-full instead of healing for `amount` (only meaningful for `heal`). */
  healToFull?: boolean
  /** Bolster every friendly unit by 1 instead of a single random one. */
  bolsterAll?: boolean
  /** Freeze every enemy unit instead of just one (used by epic/legendary frostbite). */
  freezeAll?: boolean
  /** Summon one of these in the next empty lane (default `summon` keyword). */
  summonOne?: SummonSpec
  /** Summon one of these in *every* empty lane (replaces summonOne if present). */
  summonAll?: SummonSpec
  /** Add this keyword to the summoned unit (alongside its primary `effect`). */
  grantsKeyword?: CardEffect
  /** Deathrattle behaviour, evaluated when this unit dies in combat. */
  deathrattle?: DeathrattleSpec
}

const DEFAULT_EFFECT_AMOUNT: Partial<Record<CardEffect, number>> = {
  blast: 2,
  heal: 2,
  draw: 1,
  rally: 1,
  empower: 1,
  drain: 1,
  poison: 1,
  shield: 3,
  siphon: 2,
  bolster: 1,
}

const DEFAULT_TOKEN: SummonSpec = {
  id: 'token-spark',
  name: 'Spark',
  icon: '⚡',
  attack: 1,
  health: 1,
}

const CARD_PARAMS: Record<string, CardParams> = {
  // ── Common overrides
  'fire-imp':            { amount: 1 }, // Blast 1 (under-rarity)
  'field-medic':         { amount: 3 }, // Heal 3
  'coral-guardian':      { amount: 2 }, // Shield 2 (under-rarity)
  'flame-juggler':       { amount: 1 }, // Blast 1 — differentiated from rare ember-witch (Blast 2)

  // ── Rare overrides
  'runebound-oracle':    { amount: 2 }, // Draw 2
  'vine-lasher':         { amount: 2 }, // Poison 2
  'storm-shaman':        { amount: 3 }, // Blast 3
  'bone-collector':      { amount: 2 }, // Drain 2
  'iron-clad':           { extras: [{ kind: 'shield', amount: 2 }] }, // Guard + Shield 2
  'arcane-artificer':    { summonOne: { id: 'token-wisp', name: 'Wisp', icon: '✨', attack: 1, health: 1 } },
  'ghost-knight':        { deathrattle: { kind: 'damage-hero', amount: 2 } },
  'lava-hound':          { deathrattle: { kind: 'damage-all-enemy-units', amount: 3 } },

  // ── Epic overrides
  'nether-witch':        { extras: [{ kind: 'draw' }] },                      // Blast 2 + Draw
  'storm-titan':         { amount: 3, extras: [{ kind: 'draw' }] },           // Blast 3 + Draw (was bugged at 2)
  'abyssal-tyrant':      { extras: [{ kind: 'blast', amount: 2 }] },          // Silence + Blast 2
  'phoenix-ascendant':   { deathrattle: { kind: 'damage-hero', amount: 3 } },
  'glacial-colossus':    { freezeAll: true, grantsKeyword: 'guard' },
  'blood-queen':         { amount: 3, grantsKeyword: 'lifesteal' },           // Siphon 3 + Lifesteal
  'ancient-hydra':       { extras: [{ kind: 'cleave' }], grantsKeyword: 'fury' },
  'void-empress':        { amount: 2 },                                       // Empower 2
  'necro-sage':          { summonAll: { id: 'token-ghoul', name: 'Ghoul', icon: '💀', attack: 2, health: 2 } },
  'druid-elder':         { amount: 4, bolsterAll: true },                     // Heal 4 + Bolster all
  'shadow-assassin':     { grantsKeyword: 'lifesteal' },                      // Charge + Lifesteal
  'arcane-golem':        { amount: 3, extras: [{ kind: 'draw' }] },           // Rally 3 + Draw

  // ── Legendary overrides
  'drakarion-the-eternal':   { extras: [{ kind: 'cleave' }] },                                             // Charge + Cleave
  'zephyr-world-breaker':    { freezeAll: true, grantsKeyword: 'guard', extras: [{ kind: 'blast', amount: 4 }] },
  'velara-the-lifebinder':   { healToFull: true, extras: [{ kind: 'empower', amount: 2 }] },
  'malachar-the-undying':    { summonAll: { id: 'token-wraith', name: 'Wraith', icon: '👻', attack: 3, health: 3 } },
  'kronos-the-forgemaster':  { amount: 3, extras: [{ kind: 'shield', amount: 5 }] },                       // Empower 3 + Shield 5
  'aethon-runekeeper':       { amount: 3, extras: [{ kind: 'rally', amount: 3 }] },                        // Draw 3 + Rally 3
}

function getCardParams(cardId: string): CardParams {
  return CARD_PARAMS[cardId] ?? {}
}

function getEffectAmount(card: CardInstance, kind?: CardEffect, override?: number): number {
  if (override !== undefined) return override
  const params = getCardParams(card.id)
  if (params.amount !== undefined && (kind === undefined || kind === card.effect)) {
    return params.amount
  }
  // Resolve the effect kind to look up. A card with no `effect` and no
  // explicit `kind` falls through to 0 (no work to do); we never invent
  // a default keyword for an effect-less unit.
  const resolvedKind = kind ?? card.effect
  if (!resolvedKind) return 0
  return DEFAULT_EFFECT_AMOUNT[resolvedKind] ?? 0
}

/**
 * Returns the deathrattle definition for a card if any. Uses the
 * data-driven CARD_PARAMS table — no hard-coded id checks elsewhere.
 */
export function getDeathrattle(cardId: string): DeathrattleSpec | undefined {
  return CARD_PARAMS[cardId]?.deathrattle
}

export function getRecommendedAIDifficulty(rating: number): AIDifficulty {
  if (rating >= 1500) {
    return 'legend'
  }

  if (rating >= 1325) {
    return 'veteran'
  }

  if (rating >= 1150) {
    return 'adept'
  }

  return 'novice'
}

export function shuffle<T>(items: T[]): T[] {
  const deck = [...items]

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]]
  }

  return deck
}

export function otherSide(side: BattleSide): BattleSide {
  return side === 'player' ? 'enemy' : 'player'
}

export function getDeckSize(config: DeckConfig): number {
  return CARD_LIBRARY.reduce((total, card) => total + (config[card.id] ?? 0), 0)
}

export function buildDeck(config: DeckConfig): CardInstance[] {
  const safeConfig = getDeckSize(config) >= MIN_DECK_SIZE ? config : DEFAULT_DECK_CONFIG
  const cards: CardInstance[] = []

  CARD_LIBRARY.forEach((card) => {
    const count = safeConfig[card.id] ?? 0

    for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
      cards.push({
        ...card,
        instanceId: `${card.id}-${copyIndex}-${Math.random().toString(36).slice(2, 8)}`,
      })
    }
  })

  return shuffle(cards)
}

export function drawCards(player: PlayerState, count: number): PlayerState {
  let nextPlayer = { ...player, deck: [...player.deck], hand: [...player.hand] }

  for (let draw = 0; draw < count; draw += 1) {
    if (!nextPlayer.deck.length) {
      break
    }

    const [nextCard, ...rest] = nextPlayer.deck
    nextPlayer = {
      ...nextPlayer,
      deck: rest,
      hand: [...nextPlayer.hand, nextCard],
    }
  }

  return nextPlayer
}

export function resetBoard(board: Array<Unit | null>): Array<Unit | null> {
  return board.map((unit) => (unit ? { ...unit, exhausted: false } : null))
}

export function summonUnit(card: CardInstance): Unit {
  const params = getCardParams(card.id)
  const keywords = params.grantsKeyword ? [params.grantsKeyword] : undefined
  // A unit gets to act on summon if it has Charge as either its primary
  // effect or as a granted keyword.
  const isCharger = card.effect === 'charge' || keywords?.includes('charge') === true
  return {
    ...card,
    uid: `${card.instanceId}-${Math.random().toString(36).slice(2, 9)}`,
    currentHealth: card.health,
    exhausted: !isCharger,
    keywords,
  }
}

export function pushLog(log: string[], entry: string): string[] {
  return [entry, ...log].slice(0, 10)
}

export function boardHasGuard(board: Array<Unit | null>): boolean {
  return board.some((unit) => Boolean(unit) && hasKeyword(unit as Unit, 'guard'))
}

export function beginTurn(player: PlayerState): PlayerState {
  const withCard = drawCards(player, 1)
  const nextMana = Math.min(10, withCard.maxMana + 1)

  return {
    ...withCard,
    maxMana: nextMana,
    mana: nextMana,
    momentum: Math.min(10, withCard.momentum + 1),
    board: resetBoard(withCard.board),
  }
}

export function ensurePlayableOpeningHand(player: PlayerState): PlayerState {
  if (player.hand.some((card) => card.cost <= 1) || player.hand.length === 0) {
    return player
  }

  const deckIndex = player.deck.findIndex((card) => card.cost <= 1)

  if (deckIndex === -1) {
    return player
  }

  const nextDeck = [...player.deck]
  const [replacement] = nextDeck.splice(deckIndex, 1)
  const highestCostIndex = player.hand.reduce(
    (currentHighest, card, index, hand) =>
      card.cost > hand[currentHighest].cost ? index : currentHighest,
    0,
  )
  const nextHand = [...player.hand]
  const swappedOut = nextHand[highestCostIndex]
  nextHand[highestCostIndex] = replacement
  nextDeck.push(swappedOut)

  return {
    ...player,
    hand: nextHand,
    deck: shuffle(nextDeck),
  }
}

export function createPlayer(name: string, deckConfig: DeckConfig): PlayerState {
  const basePlayer: PlayerState = {
    name,
    health: STARTING_HEALTH,
    mana: 0,
    maxMana: 0,
    momentum: 0,
    deck: buildDeck(deckConfig),
    hand: [],
    board: Array<Unit | null>(BOARD_SIZE).fill(null),
  }

  return ensurePlayableOpeningHand(drawCards(basePlayer, STARTING_HAND))
}

export function createGame(mode: GameMode, deckConfig: DeckConfig, enemyName?: string, aiDifficulty: AIDifficulty = 'adept'): GameState {
  const resolvedDifficulty = mode === 'ai' ? aiDifficulty : 'legend'

  return {
    mode,
    aiDifficulty: resolvedDifficulty,
    player: beginTurn(createPlayer(mode === 'duel' ? 'Player One' : 'You', deckConfig)),
    enemy: createPlayer(
      enemyName ?? (mode === 'duel' ? 'Player Two' : 'Nemesis AI'),
      mode === 'duel' ? deckConfig : AI_DIFFICULTY_DECKS[resolvedDifficulty],
    ),
    turn: 'player',
    turnNumber: 1,
    log: [
      mode === 'duel'
        ? 'Local duel ready. Build decks and pass the device between turns.'
        : `${resolvedDifficulty.charAt(0).toUpperCase() + resolvedDifficulty.slice(1)} AI battle ready. Build momentum and dominate the lanes.`,
    ],
    winner: null,
  }
}

export function createDuelGame(
  player1Name: string,
  player1Deck: DeckConfig,
  player2Name: string,
  player2Deck: DeckConfig,
): GameState {
  return {
    mode: 'duel',
    aiDifficulty: 'legend',
    player: beginTurn(createPlayer(player1Name, player1Deck)),
    enemy: createPlayer(player2Name, player2Deck),
    turn: 'player',
    turnNumber: 1,
    log: ['Duel ready. Prepare your strategy.'],
    winner: null,
  }
}

export type RedactedPlayerState = {
  name: string
  health: number
  mana: number
  maxMana: number
  momentum: number
  deck: CardInstance[]
  hand: CardInstance[]
  board: Array<Unit | null>
  deckCount: number
  handCount: number
}

export type RedactedGameState = {
  mode: GameMode
  aiDifficulty: AIDifficulty
  player: RedactedPlayerState
  enemy: RedactedPlayerState
  turn: BattleSide
  turnNumber: number
  log: string[]
  winner: Winner
}

export function redactGameState(state: GameState, forSide: BattleSide): RedactedGameState {
  const own = state[forSide]
  const opp = state[otherSide(forSide)]
  const remapSide = (s: BattleSide): BattleSide => s === forSide ? 'player' : 'enemy'

  const ownRedacted: RedactedPlayerState = {
    name: own.name,
    health: own.health,
    mana: own.mana,
    maxMana: own.maxMana,
    momentum: own.momentum,
    deck: [],
    hand: own.hand,
    board: own.board,
    deckCount: own.deck.length,
    handCount: own.hand.length,
  }

  const oppRedacted: RedactedPlayerState = {
    name: opp.name,
    health: opp.health,
    mana: opp.mana,
    maxMana: opp.maxMana,
    momentum: opp.momentum,
    deck: [],
    hand: [],
    board: opp.board,
    deckCount: opp.deck.length,
    handCount: opp.hand.length,
  }

  return {
    mode: state.mode,
    aiDifficulty: state.aiDifficulty,
    player: ownRedacted,
    enemy: oppRedacted,
    turn: remapSide(state.turn),
    turnNumber: state.turnNumber,
    log: state.log,
    winner: state.winner === 'draw' ? 'draw' : state.winner ? remapSide(state.winner) : null,
  }
}

export function finalizeGame(
  base: GameState,
  player: PlayerState,
  enemy: PlayerState,
  log: string[],
): GameState {
  let winner: Winner = base.winner
  let nextLog = log

  if (!winner) {
    if (player.health <= 0 && enemy.health <= 0) {
      winner = 'draw'
      nextLog = pushLog(nextLog, 'Both champions fall. The match ends in a draw.')
    } else if (enemy.health <= 0) {
      winner = 'player'
      nextLog = pushLog(nextLog, `${player.name} claims the victory.`)
    } else if (player.health <= 0) {
      winner = 'enemy'
      nextLog = pushLog(nextLog, `${enemy.name} claims the victory.`)
    }
  }

  return {
    ...base,
    player,
    enemy,
    log: nextLog,
    winner,
  }
}

export function applySides(
  base: GameState,
  side: BattleSide,
  actor: PlayerState,
  rival: PlayerState,
  log: string[],
): GameState {
  return side === 'player'
    ? finalizeGame(base, actor, rival, log)
    : finalizeGame(base, rival, actor, log)
}

export function surrenderGame(base: GameState, side: BattleSide): GameState {
  if (base.winner) {
    return base
  }

  const loser = base[side]
  const winnerSide = otherSide(side)
  const winner = base[winnerSide]

  return {
    ...base,
    winner: winnerSide,
    log: pushLog(base.log, `${loser.name} abandons the battle. ${winner.name} wins by forfeit.`),
  }
}

export function playCard(base: GameState, side: BattleSide, handIndex: number): GameState {
  if (base.winner) {
    return base
  }

  const actor = base[side]
  const rival = base[otherSide(side)]
  const firstOpenLane = actor.board.findIndex((slot) => slot === null)
  const card = actor.hand[handIndex]

  if (!card || card.cost > actor.mana || firstOpenLane === -1) {
    return base
  }

  const params = getCardParams(card.id)

  const nextBoard = [...actor.board]
  nextBoard[firstOpenLane] = summonUnit(card)

  let nextActor: PlayerState = {
    ...actor,
    mana: actor.mana - card.cost,
    hand: actor.hand.filter((_, index) => index !== handIndex),
    board: nextBoard,
  }
  let nextRival = rival
  let nextLog = pushLog(base.log, `${actor.name} played ${card.icon} ${card.name}.`)

  // Resolve a single keyword "step" (used both for the primary effect and
  // any extras listed in CARD_PARAMS). Returns the updated tuple.
  function resolveKeyword(kind: CardEffect, override?: number): void {
    const amount = getEffectAmount(card, kind, override)

    if (kind === 'rally') {
      nextActor = { ...nextActor, momentum: Math.min(10, nextActor.momentum + amount) }
      nextLog = pushLog(nextLog, `${card.name} rallies the crowd for +${amount} Momentum.`)
      return
    }

    if (kind === 'blast') {
      nextRival = { ...nextRival, health: nextRival.health - amount }
      nextLog = pushLog(nextLog, `${card.name} blasts the opposing hero for ${amount}.`)
      return
    }

    if (kind === 'heal') {
      if (params.healToFull) {
        nextActor = { ...nextActor, health: STARTING_HEALTH }
        nextLog = pushLog(nextLog, `${card.name} restores the hero to full health.`)
      } else {
        nextActor = { ...nextActor, health: Math.min(STARTING_HEALTH, nextActor.health + amount) }
        nextLog = pushLog(nextLog, `${card.name} restores ${amount} health.`)
      }
      return
    }

    if (kind === 'draw') {
      nextActor = drawCards(nextActor, amount)
      const drawLabel = amount === 1 ? 'a fresh omen' : `${amount} omens`
      nextLog = pushLog(nextLog, `${card.name} draws ${drawLabel} from the deck.`)
      return
    }

    if (kind === 'drain') {
      const stolen = Math.min(nextRival.momentum, amount)
      nextRival = { ...nextRival, momentum: nextRival.momentum - stolen }
      nextActor = { ...nextActor, momentum: Math.min(10, nextActor.momentum + stolen) }
      nextLog = pushLog(nextLog, `${card.name} drains ${stolen} Momentum from the enemy.`)
      return
    }

    if (kind === 'empower') {
      nextActor = {
        ...nextActor,
        board: nextActor.board.map((unit) =>
          unit ? { ...unit, attack: unit.attack + amount } : null,
        ),
      }
      nextLog = pushLog(nextLog, `${card.name} empowers all friendly units with +${amount} attack.`)
      return
    }

    if (kind === 'poison') {
      nextRival = {
        ...nextRival,
        board: nextRival.board.map((unit) => {
          if (!unit) return null
          const damaged = { ...unit, currentHealth: unit.currentHealth - amount }
          return damaged.currentHealth > 0 ? damaged : null
        }),
      }
      nextLog = pushLog(nextLog, `${card.name} poisons all enemy units for ${amount} damage.`)
      return
    }

    if (kind === 'shield') {
      nextActor = { ...nextActor, health: nextActor.health + amount }
      nextLog = pushLog(nextLog, `${card.name} shields the hero for +${amount} armor.`)
      return
    }

    if (kind === 'siphon') {
      nextRival = { ...nextRival, health: nextRival.health - amount }
      nextActor = { ...nextActor, health: Math.min(STARTING_HEALTH, nextActor.health + amount) }
      nextLog = pushLog(nextLog, `${card.name} siphons ${amount} life from the enemy hero.`)
      return
    }

    if (kind === 'bolster') {
      if (params.bolsterAll) {
        nextActor = {
          ...nextActor,
          board: nextActor.board.map((unit) =>
            unit ? { ...unit, currentHealth: unit.currentHealth + amount, health: unit.health + amount } : null,
          ),
        }
        nextLog = pushLog(nextLog, `${card.name} bolsters every friendly unit with +${amount} health.`)
      } else {
        const friendlyUnits = nextActor.board
          .map((unit, idx) => (unit ? idx : -1))
          .filter((idx) => idx !== -1)
        if (friendlyUnits.length > 0) {
          const target = friendlyUnits[Math.floor(Math.random() * friendlyUnits.length)]
          nextActor = {
            ...nextActor,
            board: nextActor.board.map((unit, idx) =>
              idx === target && unit
                ? { ...unit, currentHealth: unit.currentHealth + amount, health: unit.health + amount }
                : unit,
            ),
          }
          const boostedUnit = nextActor.board[target]
          nextLog = pushLog(nextLog, `${card.name} bolsters ${boostedUnit?.name ?? 'a unit'} with +${amount} health.`)
        }
      }
      return
    }

    if (kind === 'frostbite') {
      if (params.freezeAll) {
        nextRival = {
          ...nextRival,
          board: nextRival.board.map((unit) => (unit ? { ...unit, exhausted: true } : null)),
        }
        nextLog = pushLog(nextLog, `${card.name} freezes all enemy units solid.`)
      } else {
        const enemyUnits = nextRival.board.map((u, i) => (u ? i : -1)).filter((i) => i !== -1)
        if (enemyUnits.length > 0) {
          const target = enemyUnits[Math.floor(Math.random() * enemyUnits.length)]
          nextRival = {
            ...nextRival,
            board: nextRival.board.map((unit, idx) =>
              idx === target && unit ? { ...unit, exhausted: true } : unit,
            ),
          }
          const frozen = nextRival.board[target]
          nextLog = pushLog(nextLog, `${card.name} freezes ${frozen?.name ?? 'a unit'}.`)
        }
      }
      return
    }

    if (kind === 'silence') {
      nextRival = {
        ...nextRival,
        board: nextRival.board.map((unit) =>
          unit ? { ...unit, effect: undefined, keywords: undefined } : null,
        ),
      }
      nextLog = pushLog(nextLog, `${card.name} silences all enemy units.`)
      return
    }

    if (kind === 'summon') {
      const summonAll = params.summonAll
      const summonOne = params.summonOne ?? DEFAULT_TOKEN
      const emptyLanes = nextActor.board
        .map((u, i) => (u === null ? i : -1))
        .filter((i) => i !== -1)
      if (summonAll) {
        for (const lane of emptyLanes) {
          nextActor = {
            ...nextActor,
            board: nextActor.board.map((unit, idx) =>
              idx === lane
                ? summonUnit({
                    ...card,
                    id: summonAll.id,
                    name: summonAll.name,
                    icon: summonAll.icon,
                    cost: 0,
                    attack: summonAll.attack,
                    health: summonAll.health,
                    text: 'Summoned token.',
                    effect: undefined,
                    instanceId: `${summonAll.id}-${lane}-${Math.random().toString(36).slice(2, 8)}`,
                  })
                : unit,
            ),
          }
        }
        nextLog = pushLog(nextLog, `${card.name} summons ${summonAll.name}s in every empty lane.`)
      } else if (emptyLanes.length > 0) {
        const lane = emptyLanes[0]
        nextActor = {
          ...nextActor,
          board: nextActor.board.map((unit, idx) =>
            idx === lane
              ? summonUnit({
                  ...card,
                  id: summonOne.id,
                  name: summonOne.name,
                  icon: summonOne.icon,
                  cost: 0,
                  attack: summonOne.attack,
                  health: summonOne.health,
                  text: 'Summoned token.',
                  effect: undefined,
                  instanceId: `${summonOne.id}-${lane}-${Math.random().toString(36).slice(2, 8)}`,
                })
              : unit,
          ),
        }
        nextLog = pushLog(nextLog, `${card.name} conjures a ${summonOne.name}.`)
      }
      return
    }

    if (kind === 'cleave') {
      // Cleave-on-summon: deal damage equal to this card's attack to every
      // enemy unit. (Cleave keyword on combat is handled in `attack`.)
      const cleaveAmount = override ?? card.attack
      nextRival = {
        ...nextRival,
        board: nextRival.board.map((unit) => {
          if (!unit) return null
          const damaged = { ...unit, currentHealth: unit.currentHealth - cleaveAmount }
          return damaged.currentHealth > 0 ? damaged : null
        }),
      }
      nextLog = pushLog(nextLog, `${card.name} cleaves all enemy units for ${cleaveAmount}.`)
      return
    }

    // No-op for keywords resolved at combat time (charge / guard / fury /
    // lifesteal / enrage / overwhelm / deathrattle): they are reflected by
    // the unit's keyword/effect and applied in `attack()`.
  }

  if (card.effect) {
    resolveKeyword(card.effect)
  }

  if (params.extras) {
    for (const extra of params.extras) {
      resolveKeyword(extra.kind, extra.amount)
    }
  }

  return applySides(base, side, nextActor, nextRival, nextLog)
}

export function castMomentumBurst(base: GameState, side: BattleSide): GameState {
  if (base.winner) {
    return base
  }

  const actor = base[side]
  const rival = base[otherSide(side)]

  if (actor.momentum < 3) {
    return base
  }

  const nextActor = drawCards(
    {
      ...actor,
      momentum: actor.momentum - 3,
    },
    1,
  )

  const nextRival = {
    ...rival,
    health: rival.health - 2,
  }

  const nextLog = pushLog(
    base.log,
    `${actor.name} unleashes Momentum Burst for 2 damage and a bonus draw.`,
  )

  return applySides(base, side, nextActor, nextRival, nextLog)
}

export function attack(
  base: GameState,
  side: BattleSide,
  attackerIndex: number,
  target: number | 'hero',
): GameState {
  if (base.winner) {
    return base
  }

  const actor = base[side]
  const rival = base[otherSide(side)]
  const attacker = actor.board[attackerIndex]

  if (!attacker || attacker.exhausted) {
    return base
  }

  const guardLock = boardHasGuard(rival.board)
  if (guardLock && (target === 'hero' || (rival.board[target] && !hasKeyword(rival.board[target] as Unit, 'guard')))) {
    return base
  }

  const actorBoard = [...actor.board]
  const rivalBoard = [...rival.board]
  let nextActor: PlayerState = {
    ...actor,
    board: actorBoard,
    momentum: Math.min(10, actor.momentum + 1),
  }
  let nextRival: PlayerState = {
    ...rival,
    board: rivalBoard,
  }
  let nextLog = base.log

  if (target === 'hero') {
    const updatedAttacker: Unit = { ...attacker, exhausted: true }
    actorBoard[attackerIndex] =
      hasKeyword(updatedAttacker, 'fury')
        ? { ...updatedAttacker, attack: updatedAttacker.attack + 1 }
        : updatedAttacker

    nextRival = {
      ...nextRival,
      health: nextRival.health - updatedAttacker.attack,
    }

    // Lifesteal: heal hero for damage dealt
    if (hasKeyword(updatedAttacker, 'lifesteal')) {
      nextActor = { ...nextActor, health: Math.min(STARTING_HEALTH, nextActor.health + updatedAttacker.attack) }
      nextLog = pushLog(nextLog, `${updatedAttacker.name} steals ${updatedAttacker.attack} life.`)
    }

    nextLog = pushLog(
      nextLog,
      `${actor.name}'s ${updatedAttacker.name} hits ${nextRival.name} for ${updatedAttacker.attack}.`,
    )

    if (hasKeyword(updatedAttacker, 'fury')) {
      nextLog = pushLog(nextLog, `${updatedAttacker.name} grows stronger from Fury.`)
    }
  } else {
    const defender = rival.board[target]

    if (!defender) {
      return base
    }

    let damagedAttacker: Unit = {
      ...attacker,
      exhausted: true,
      currentHealth: attacker.currentHealth - defender.attack,
    }
    const damagedDefender: Unit = {
      ...defender,
      currentHealth: defender.currentHealth - attacker.attack,
    }

    // Enrage: if damaged but alive, gain +2 attack
    if (damagedAttacker.currentHealth > 0 && damagedAttacker.currentHealth < attacker.currentHealth && hasKeyword(damagedAttacker, 'enrage')) {
      damagedAttacker = { ...damagedAttacker, attack: damagedAttacker.attack + 2 }
      nextLog = pushLog(nextLog, `${damagedAttacker.name} enters a furious enrage! +2 attack.`)
    }

    if (damagedAttacker.currentHealth > 0 && hasKeyword(damagedAttacker, 'fury')) {
      damagedAttacker = {
        ...damagedAttacker,
        attack: damagedAttacker.attack + 1,
      }
      nextLog = pushLog(nextLog, `${damagedAttacker.name} survives and gains +1 attack.`)
    }

    // Lifesteal: heal hero for damage dealt in combat
    if (hasKeyword(attacker, 'lifesteal') && damagedDefender.currentHealth < defender.currentHealth) {
      const healAmt = Math.min(attacker.attack, defender.currentHealth)
      nextActor = { ...nextActor, health: Math.min(STARTING_HEALTH, nextActor.health + healAmt) }
      nextLog = pushLog(nextLog, `${attacker.name} steals ${healAmt} life.`)
    }

    // Overwhelm: excess damage hits the enemy hero
    if (hasKeyword(attacker, 'overwhelm') && damagedDefender.currentHealth <= 0) {
      const excess = Math.abs(damagedDefender.currentHealth)
      if (excess > 0) {
        nextRival = { ...nextRival, health: nextRival.health - excess }
        nextLog = pushLog(nextLog, `${attacker.name} overwhelms for ${excess} to the hero.`)
      }
    }

    // Deathrattle triggers — data-driven via getDeathrattle()
    function applyDeathrattle(deadUnit: Unit, friendlySide: 'attacker' | 'defender'): void {
      const dr = getDeathrattle(deadUnit.id)
      if (!dr) return
      if (dr.kind === 'damage-hero') {
        if (friendlySide === 'defender') {
          // The dying unit is on the defender (rival) side; their deathrattle damages our hero.
          nextActor = { ...nextActor, health: nextActor.health - dr.amount }
          nextLog = pushLog(nextLog, `${deadUnit.name}'s spirit lashes out for ${dr.amount} damage.`)
        } else {
          nextRival = { ...nextRival, health: nextRival.health - dr.amount }
          nextLog = pushLog(nextLog, `${deadUnit.name} erupts in flame: ${dr.amount} to the enemy hero.`)
        }
      } else if (dr.kind === 'damage-all-enemy-units') {
        if (friendlySide === 'defender') {
          // dying defender — its deathrattle hits attacker's board
          nextActor = {
            ...nextActor,
            board: actorBoard.map((unit) => {
              if (!unit) return null
              const damaged = { ...unit, currentHealth: unit.currentHealth - dr.amount }
              return damaged.currentHealth > 0 ? damaged : null
            }),
          }
          nextLog = pushLog(nextLog, `${deadUnit.name} erupts, dealing ${dr.amount} to all units.`)
        } else {
          nextRival = {
            ...nextRival,
            board: rivalBoard.map((unit) => {
              if (!unit) return null
              const damaged = { ...unit, currentHealth: unit.currentHealth - dr.amount }
              return damaged.currentHealth > 0 ? damaged : null
            }),
          }
          nextLog = pushLog(nextLog, `${deadUnit.name} erupts, dealing ${dr.amount} to all enemy units.`)
        }
      }
    }

    if (damagedDefender.currentHealth <= 0) applyDeathrattle(defender, 'defender')
    if (damagedAttacker.currentHealth <= 0) applyDeathrattle(attacker, 'attacker')

    actorBoard[attackerIndex] = damagedAttacker.currentHealth > 0 ? damagedAttacker : null
    rivalBoard[target] = damagedDefender.currentHealth > 0 ? damagedDefender : null

    nextLog = pushLog(nextLog, `${attacker.name} clashes with ${defender.name}.`)
  }

  nextActor = {
    ...nextActor,
    board: actorBoard,
  }
  nextRival = {
    ...nextRival,
    board: rivalBoard,
  }

  return applySides(base, side, nextActor, nextRival, nextLog)
}

function scorePlayableCard(card: CardInstance, difficulty: AIDifficulty, needsGuard: boolean, lowOnCards: boolean): number {
  let score = card.cost * 1.25 + card.attack * 2 + card.health

  if (card.effect === 'guard') score += needsGuard ? 7 : 2
  if (card.effect === 'charge') score += difficulty === 'legend' ? 5 : 3
  if (card.effect === 'draw') score += lowOnCards ? 5 : 2
  if (card.effect === 'blast' || card.effect === 'poison' || card.effect === 'siphon') score += 4
  if (card.effect === 'summon' || card.effect === 'empower' || card.effect === 'rally') score += 3
  if (card.rarity === 'legendary') score += difficulty === 'legend' ? 4 : 2
  if (difficulty === 'novice') score -= card.cost * 0.35

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

  if (difficulty === 'novice') {
    affordable.sort((left, right) => left.card.cost - right.card.cost)
    return affordable[0].index
  }

  const actor = game?.[side]
  const needsGuard = actor ? actor.health <= 12 && !boardHasGuard(actor.board) : false
  const lowOnCards = actor ? actor.hand.length <= 2 : false

  let bestIndex = affordable[0].index
  let bestScore = -Infinity

  affordable.forEach(({ card, index }) => {
    let score = scorePlayableCard(card, difficulty, needsGuard, lowOnCards)

    if (game) {
      if ((game.player.health <= 8 || game.player.board.filter(Boolean).length >= 2) && (card.effect === 'blast' || card.effect === 'poison')) {
        score += 4
      }
      if (game.enemy.board.filter(Boolean).length === 0 && card.effect === 'guard') {
        score += 2
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

  const heroPressure = game.enemy.board.reduce((total, unit) => total + (unit && !unit.exhausted ? unit.attack : 0), 0)
  let heroScore = attacker.attack + (game.player.health <= heroPressure ? 6 : 0)

  if (difficulty === 'novice') {
    const easyTrade = game.player.board.findIndex((unit) => unit !== null && unit.currentHealth <= attacker.attack)
    return easyTrade !== -1 && Math.random() < 0.7 ? easyTrade : 'hero'
  }

  let bestLane = -1
  let bestScore = -Infinity

  game.player.board.forEach((unit, index) => {
    if (!unit) {
      return
    }

    let score = unit.attack * 2 + unit.currentHealth

    if (unit.currentHealth <= attacker.attack) score += 8
    if (attacker.currentHealth > unit.attack) score += 5
    if (unit.attack >= attacker.currentHealth) score -= difficulty === 'legend' ? 1 : 3
    if (hasKeyword(unit, 'guard')) score += 6
    if (hasKeyword(unit, 'poison') || hasKeyword(unit, 'lifesteal') || hasKeyword(unit, 'cleave')) score += 4
    if (difficulty === 'legend' && unit.attack >= 4) score += 4

    if (score > bestScore) {
      bestLane = index
      bestScore = score
    }
  })

  if (difficulty === 'legend' && game.enemy.health < game.player.health) {
    heroScore += 3
  }

  return bestLane !== -1 && bestScore >= heroScore ? bestLane : 'hero'
}

export function passTurn(base: GameState): GameState {
  if (base.winner) {
    return base
  }

  const nextTurn = otherSide(base.turn)
  const nextName = base[nextTurn].name

  if (nextTurn === 'player') {
    return {
      ...base,
      turn: 'player',
      turnNumber: base.turnNumber + 1,
      player: beginTurn(base.player),
      log: pushLog(base.log, `${nextName} starts the turn.`),
    }
  }

  return {
    ...base,
    turn: 'enemy',
    turnNumber: base.turnNumber + 1,
    enemy: beginTurn(base.enemy),
    log: pushLog(base.log, `${nextName} starts the turn.`),
  }
}

function shouldEnemyUseBurst(game: GameState, difficulty: AIDifficulty): boolean {
  if (game.enemy.momentum < 3) {
    return false
  }

  if (game.player.health <= 2) {
    return true
  }

  if (difficulty === 'novice') {
    return game.player.health <= 6
  }

  if (difficulty === 'adept') {
    return game.player.health <= 12 || game.enemy.hand.length === 0
  }

  const enemyBoardCount = game.enemy.board.filter(Boolean).length
  const playerBoardCount = game.player.board.filter(Boolean).length
  return game.player.health <= 10 || game.enemy.hand.length === 0 || enemyBoardCount < playerBoardCount
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
