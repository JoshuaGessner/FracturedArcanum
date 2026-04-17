import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import { playSound } from './audio'
import './App.css'

type GameMode = 'ai' | 'duel'
type BattleSide = 'player' | 'enemy'
type QueueState = 'idle' | 'searching' | 'found'
type AppScreen = 'home' | 'deck' | 'battle' | 'vault' | 'ops'
type CosmeticTheme = 'royal' | 'ember' | 'moon'
type AuthScreen = 'login' | 'signup'
type CardEffect = 'charge' | 'guard' | 'rally' | 'blast' | 'heal' | 'draw' | 'fury' | 'drain' | 'empower' | 'poison' | 'shield' | 'siphon' | 'bolster' | 'cleave' | 'lifesteal' | 'summon' | 'silence' | 'frostbite' | 'enrage' | 'deathrattle' | 'overwhelm'
type CardRarity = 'common' | 'rare' | 'epic' | 'legendary'
type CardTribe = 'beast' | 'elemental' | 'undead' | 'dragon' | 'mech' | 'arcane' | 'warrior' | 'nature' | 'demon' | 'none'
type Winner = BattleSide | 'draw' | null
type DeckConfig = Record<string, number>

type OpponentProfile = {
  name: string
  rank: string
  style: string
  ping: number
}

type ComplaintFormState = {
  category: string
  severity: string
  summary: string
  details: string
}

type AdminComplaint = {
  id: string
  anonymousUser: string
  category: string
  severity: string
  summary: string
  details: string
  page: string
  status: string
  createdAt: string
  updates: Array<{ at: string; note: string }>
}

type AdminOverview = {
  settings: {
    motd: string
    quest: string
    featuredMode: string
    maintenanceMode: boolean
  }
  totals: {
    uniqueVisitors: number
    sessions: number
    pageViews: number
    queueJoins: number
    matchesStarted: number
    matchesCompleted: number
    installs: number
    emotes: number
    complaintsOpen: number
    complaintsResolved: number
    complaintsTotal: number
  }
  traffic: {
    pages: Array<{ route: string; views: number }>
    devices: Array<{ label: string; count: number }>
    daily: Array<{ day: string; views: number }>
  }
  complaints: AdminComplaint[]
}

type ServerProfile = {
  username: string
  runes: number
  seasonRating: number
  wins: number
  losses: number
  streak: number
  deckConfig: DeckConfig
  ownedThemes: CosmeticTheme[]
  selectedTheme: CosmeticTheme
  lastDaily: string
  totalEarned: number
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type CardTemplate = {
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

type CardInstance = CardTemplate & {
  instanceId: string
}

type Unit = CardInstance & {
  uid: string
  currentHealth: number
  exhausted: boolean
}

type PlayerState = {
  name: string
  health: number
  mana: number
  maxMana: number
  momentum: number
  deck: CardInstance[]
  hand: CardInstance[]
  board: Array<Unit | null>
}

type GameState = {
  mode: GameMode
  player: PlayerState
  enemy: PlayerState
  turn: BattleSide
  turnNumber: number
  log: string[]
  winner: Winner
}

const DEFAULT_ARENA_PORT = '43173'
const ARENA_URL =
  import.meta.env.VITE_ARENA_URL ??
  (['5173', '4173'].includes(window.location.port)
    ? `${window.location.protocol}//${window.location.hostname}:${DEFAULT_ARENA_PORT}`
    : window.location.origin)
const BOARD_SIZE = 3
const STARTING_HEALTH = 24
const STARTING_HAND = 3
const MIN_DECK_SIZE = 10
const MAX_DECK_SIZE = 16
const MAX_COPIES = 3
const MAX_LEGENDARY_COPIES = 1

const RARITY_COLORS: Record<CardRarity, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
}

const CARD_LIBRARY: CardTemplate[] = [
  // COMMON (28)
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
  { id: 'clockwork-knight', name: 'Geared Thrall', cost: 4, attack: 4, health: 4, icon: '⚙️', text: 'Reliable mid-game thrall. The gears whisper.', rarity: 'common', tribe: 'mech' },
  { id: 'storm-brute', name: 'Thunderous Colossus', cost: 5, attack: 5, health: 4, icon: '⛈️', text: 'A tall, wrong-angled thing that closes games fast.', rarity: 'common', tribe: 'elemental' },
  { id: 'siege-turtle', name: 'Carapace Wyrm', cost: 5, attack: 2, health: 8, icon: '🐢', text: 'Guard: must be attacked first. Its shell is older than the city.', effect: 'guard', rarity: 'common', tribe: 'beast' },
  { id: 'flame-juggler', name: 'Fire-Eater Cultist', cost: 4, attack: 3, health: 3, icon: '🔥', text: 'Blast: deal 2 to the opposing hero.', effect: 'blast', rarity: 'common', tribe: 'elemental' },
  { id: 'highland-archer', name: 'Barrow Archer', cost: 3, attack: 3, health: 2, icon: '🏹', text: 'Poison: deal 1 damage to all enemy units on summon. Tipped with grave-dust.', effect: 'poison', rarity: 'common', tribe: 'warrior' },
  { id: 'moss-treant', name: 'Fungal Treant', cost: 5, attack: 4, health: 5, icon: '🍄', text: 'Heal 2 to your hero on summon. Its spores mend and madden.', effect: 'heal', rarity: 'common', tribe: 'nature' },
  { id: 'coral-guardian', name: 'Coral Bastion', cost: 4, attack: 2, health: 5, icon: '🪸', text: 'Shield: give your hero +2 armor on summon.', effect: 'shield', rarity: 'common', tribe: 'nature' },
  // RARE (22)
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
  // EPIC (14)
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
  { id: 'shadow-assassin', name: 'Whispering Assassin', cost: 5, attack: 6, health: 3, icon: '🗡️', text: 'Charge. Lifesteal: heal for damage dealt.', effect: 'charge', rarity: 'epic', tribe: 'undead' },
  { id: 'arcane-golem', name: 'Runic Husk', cost: 6, attack: 5, health: 5, icon: '🔮', text: 'Rally: gain 3 Momentum on summon. Draw 1.', effect: 'rally', rarity: 'epic', tribe: 'arcane' },
  // LEGENDARY (6)
  { id: 'drakarion-the-eternal', name: 'Drakarion, the Fathomless', cost: 8, attack: 8, health: 8, icon: '🐉', text: 'Charge. Cleave all lanes. The leviathan wakes.', effect: 'charge', rarity: 'legendary', tribe: 'dragon' },
  { id: 'zephyr-world-breaker', name: 'Zephyr, the Whispering Gale', cost: 9, attack: 7, health: 10, icon: '🌪️', text: 'Guard. Frostbite all enemies. Blast: 4 to hero.', effect: 'frostbite', rarity: 'legendary', tribe: 'elemental' },
  { id: 'velara-the-lifebinder', name: 'Velara, the Mycelial', cost: 8, attack: 5, health: 9, icon: '🍄', text: 'Heal hero to full. Empower: all units gain +2 attack.', effect: 'heal', rarity: 'legendary', tribe: 'nature' },
  { id: 'malachar-the-undying', name: 'Malachar, the Carrion King', cost: 8, attack: 6, health: 7, icon: '💀', text: 'Silence all enemies. Summon a 3/3 Wraith in each lane.', effect: 'silence', rarity: 'legendary', tribe: 'undead' },
  { id: 'kronos-the-forgemaster', name: 'Kronos, the Ironclad Heretic', cost: 9, attack: 8, health: 8, icon: '⚒️', text: 'Empower: all units gain +3 attack. Shield hero: +5 armor.', effect: 'empower', rarity: 'legendary', tribe: 'mech' },
  { id: 'aethon-runekeeper', name: 'Aethon, the Starless Oracle', cost: 7, attack: 5, health: 6, icon: '📜', text: 'Draw 3 cards. Rally: gain 3 Momentum. The oracle speaks of ruin.', effect: 'draw', rarity: 'legendary', tribe: 'arcane' },
]

const DEFAULT_DECK_CONFIG: DeckConfig = {
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

const AI_DECK_CONFIG: DeckConfig = {
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

const OPPONENT_POOL: OpponentProfile[] = [
  { name: 'Nyra Gale', rank: 'Silver I', style: 'Sky Tempo', ping: 28 },
  { name: 'Bront Ember', rank: 'Gold III', style: 'Blast Midrange', ping: 34 },
  { name: 'Suri Vale', rank: 'Gold I', style: 'Moonwell Value', ping: 19 },
  { name: 'Kael Thorn', rank: 'Platinum V', style: 'Guard Control', ping: 42 },
]

const DECK_PRESETS: Array<{ name: string; config: DeckConfig }> = [
  { name: 'Balanced', config: DEFAULT_DECK_CONFIG },
  {
    name: 'Aggro',
    config: {
      'spark-imp': 3,
      'cave-bat': 2,
      'blaze-runner': 2,
      'shade-fox': 2,
      'void-leech': 1,
      'sky-raider': 2,
      'fire-imp': 1,
    },
  },
  {
    name: 'Control',
    config: {
      'ironbark-guard': 2,
      'dawn-healer': 2,
      'rust-golem': 1,
      'granite-sentinel': 1,
      'crystal-golem': 1,
      'aegis-knight': 1,
      'moonwell-sage': 1,
      'siege-turtle': 1,
      'coral-guardian': 1,
      'moss-treant': 1,
    },
  },
  {
    name: 'Tempo',
    config: {
      'spark-imp': 2,
      'void-leech': 2,
      'warcry-sentinel': 2,
      'shade-fox': 2,
      'sky-raider': 2,
      'rune-scholar': 1,
      'ember-witch': 1,
      'pack-wolf': 1,
    },
  },
]

const THEME_OFFERS: Array<{ id: CosmeticTheme; name: string; cost: number; note: string }> = [
  { id: 'royal', name: 'Royal Arcane', cost: 0, note: 'Default tournament finish.' },
  { id: 'ember', name: 'Ember Court', cost: 120, note: 'Warm volcanic glow and ember trim.' },
  { id: 'moon', name: 'Moonwell Glow', cost: 180, note: 'Cool luminous highlights and moonlight framing.' },
]

const STORAGE_KEYS = {
  deck: 'fractured-arcanum.deck',
  sound: 'fractured-arcanum.sound',
  rating: 'fractured-arcanum.rating',
  record: 'fractured-arcanum.record',
  mode: 'fractured-arcanum.mode',
  visitor: 'fractured-arcanum.visitor',
  analyticsConsent: 'fractured-arcanum.analytics-consent',
  runes: 'fractured-arcanum.shards',
  ownedThemes: 'fractured-arcanum.owned-themes',
  selectedTheme: 'fractured-arcanum.selected-theme',
  lastDailyClaim: 'fractured-arcanum.last-daily-claim',
  authToken: 'fractured-arcanum.auth-token',
}

const QUICK_EMOTES = ['⚡', '🔥', '✨', '🛡️', '😈']

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    return rawValue ? (JSON.parse(rawValue) as T) : fallback
  } catch {
    return fallback
  }
}

function createAnonymousId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `guest-${crypto.randomUUID().slice(0, 12)}`
  }

  return `guest-${Math.random().toString(36).slice(2, 14)}`
}

function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? '',
  ]
  return parts.join('|')
}

async function authFetch(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
) {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(`${ARENA_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  return response
}

function getScreenBucket() {
  if (typeof window === 'undefined') {
    return 'unknown'
  }

  if (window.innerWidth < 700) {
    return 'mobile'
  }

  if (window.innerWidth < 1100) {
    return 'tablet'
  }

  return 'desktop'
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function cardArtPath(cardId: string) {
  return `/generated/cards/${cardId}.svg`
}

const EFFECT_LABELS: Record<string, string> = {
  charge: '⚡ Charge',
  guard: '🛡️ Guard',
  rally: '📣 Rally',
  blast: '💥 Blast',
  heal: '💚 Heal',
  draw: '📜 Draw',
  fury: '🔥 Fury',
  drain: '🩸 Drain',
  empower: '📯 Empower',
  poison: '☠️ Poison',
  shield: '⚜️ Shield',
  siphon: '💀 Siphon',
  bolster: '🌊 Bolster',
  cleave: '⚔️ Cleave',
  lifesteal: '🧛 Lifesteal',
  summon: '✨ Summon',
  silence: '🔇 Silence',
  frostbite: '❄️ Frostbite',
  enrage: '😡 Enrage',
  deathrattle: '💀 Deathrattle',
  overwhelm: '🦣 Overwhelm',
}

function pulseFeedback(duration = 14) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(duration)
  }
}

function shuffle<T>(items: T[]): T[] {
  const deck = [...items]

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]]
  }

  return deck
}

function otherSide(side: BattleSide): BattleSide {
  return side === 'player' ? 'enemy' : 'player'
}

function makeLobbyCode(): string {
  return `RUNE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function getRankLabel(rating: number): string {
  if (rating >= 1500) {
    return 'Diamond'
  }

  if (rating >= 1300) {
    return 'Gold'
  }

  if (rating >= 1150) {
    return 'Silver'
  }

  return 'Bronze'
}

function pickOpponent(): OpponentProfile {
  return OPPONENT_POOL[Math.floor(Math.random() * OPPONENT_POOL.length)]
}

function getDeckSize(config: DeckConfig): number {
  return CARD_LIBRARY.reduce((total, card) => total + (config[card.id] ?? 0), 0)
}

function buildDeck(config: DeckConfig): CardInstance[] {
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

function drawCards(player: PlayerState, count: number): PlayerState {
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

function resetBoard(board: Array<Unit | null>): Array<Unit | null> {
  return board.map((unit) => (unit ? { ...unit, exhausted: false } : null))
}

function summonUnit(card: CardInstance): Unit {
  return {
    ...card,
    uid: `${card.instanceId}-${Math.random().toString(36).slice(2, 9)}`,
    currentHealth: card.health,
    exhausted: card.effect !== 'charge',
  }
}

function pushLog(log: string[], entry: string): string[] {
  return [entry, ...log].slice(0, 10)
}

function boardHasGuard(board: Array<Unit | null>): boolean {
  return board.some((unit) => unit?.effect === 'guard')
}

function beginTurn(player: PlayerState): PlayerState {
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

function ensurePlayableOpeningHand(player: PlayerState): PlayerState {
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

function createPlayer(name: string, deckConfig: DeckConfig): PlayerState {
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

function createGame(mode: GameMode, deckConfig: DeckConfig, enemyName?: string): GameState {
  return {
    mode,
    player: beginTurn(createPlayer(mode === 'duel' ? 'Player One' : 'You', deckConfig)),
    enemy: createPlayer(
      enemyName ?? (mode === 'duel' ? 'Player Two' : 'Nemesis AI'),
      mode === 'duel' ? deckConfig : AI_DECK_CONFIG,
    ),
    turn: 'player',
    turnNumber: 1,
    log: [
      mode === 'duel'
        ? 'Local duel ready. Build decks and pass the device between turns.'
        : 'Battle ready. Build momentum and dominate the lanes.',
    ],
    winner: null,
  }
}

function finalizeGame(
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

function applySides(
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

function playCard(base: GameState, side: BattleSide, handIndex: number): GameState {
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

  if (card.effect === 'rally') {
    nextActor = {
      ...nextActor,
      momentum: Math.min(10, nextActor.momentum + 1),
    }
    nextLog = pushLog(nextLog, `${card.name} rallies the crowd for +1 Momentum.`)
  }

  if (card.effect === 'blast') {
    nextRival = {
      ...nextRival,
      health: nextRival.health - 2,
    }
    nextLog = pushLog(nextLog, `${card.name} blasts the opposing hero for 2.`)
  }

  if (card.effect === 'heal') {
    nextActor = {
      ...nextActor,
      health: Math.min(STARTING_HEALTH, nextActor.health + 2),
    }
    nextLog = pushLog(nextLog, `${card.name} restores 2 health.`)
  }

  if (card.effect === 'draw') {
    const drawCount = card.id === 'runebound-oracle' ? 2 : 1
    nextActor = drawCards(nextActor, drawCount)
    nextLog = pushLog(nextLog, `${card.name} draws ${drawCount === 2 ? '2 omens' : 'a fresh omen'} from the deck.`)
  }

  if (card.effect === 'drain') {
    const stolen = Math.min(nextRival.momentum, 1)
    nextRival = { ...nextRival, momentum: nextRival.momentum - stolen }
    nextActor = { ...nextActor, momentum: Math.min(10, nextActor.momentum + stolen) }
    nextLog = pushLog(nextLog, `${card.name} drains ${stolen} Momentum from the enemy.`)
  }

  if (card.effect === 'empower') {
    nextActor = {
      ...nextActor,
      board: nextActor.board.map((unit) =>
        unit ? { ...unit, attack: unit.attack + 1 } : null,
      ),
    }
    nextLog = pushLog(nextLog, `${card.name} empowers all friendly units with +1 attack.`)
  }

  if (card.effect === 'poison') {
    const poisonDmg = card.rarity === 'rare' && card.id === 'vine-lasher' ? 2 : 1
    nextRival = {
      ...nextRival,
      board: nextRival.board.map((unit) => {
        if (!unit) return null
        const damaged = { ...unit, currentHealth: unit.currentHealth - poisonDmg }
        return damaged.currentHealth > 0 ? damaged : null
      }),
    }
    nextLog = pushLog(nextLog, `${card.name} poisons all enemy units for ${poisonDmg} damage.`)
  }

  if (card.effect === 'shield') {
    const shieldAmt = card.id === 'coral-guardian' ? 2 : 3
    nextActor = {
      ...nextActor,
      health: nextActor.health + shieldAmt,
    }
    nextLog = pushLog(nextLog, `${card.name} shields the hero for +${shieldAmt} armor.`)
  }

  if (card.effect === 'siphon') {
    const siphonAmt = card.rarity === 'epic' ? 3 : 2
    nextRival = { ...nextRival, health: nextRival.health - siphonAmt }
    nextActor = { ...nextActor, health: Math.min(STARTING_HEALTH, nextActor.health + siphonAmt) }
    nextLog = pushLog(nextLog, `${card.name} siphons ${siphonAmt} life from the enemy hero.`)
  }

  if (card.effect === 'bolster') {
    const friendlyUnits = nextActor.board
      .map((unit, idx) => (unit ? idx : -1))
      .filter((idx) => idx !== -1)
    if (friendlyUnits.length > 0) {
      const target = friendlyUnits[Math.floor(Math.random() * friendlyUnits.length)]
      nextActor = {
        ...nextActor,
        board: nextActor.board.map((unit, idx) =>
          idx === target && unit ? { ...unit, currentHealth: unit.currentHealth + 1, health: unit.health + 1 } : unit,
        ),
      }
      const boostedUnit = nextActor.board[target]
      nextLog = pushLog(nextLog, `${card.name} bolsters ${boostedUnit?.name ?? 'a unit'} with +1 health.`)
    }
  }

  // ─── New effects ───
  if (card.effect === 'frostbite') {
    if (card.rarity === 'legendary' || card.rarity === 'epic') {
      nextRival = { ...nextRival, board: nextRival.board.map((unit) => unit ? { ...unit, exhausted: true } : null) }
      nextLog = pushLog(nextLog, `${card.name} freezes all enemy units solid.`)
    } else {
      const enemyUnits = nextRival.board.map((u, i) => (u ? i : -1)).filter((i) => i !== -1)
      if (enemyUnits.length > 0) {
        const target = enemyUnits[Math.floor(Math.random() * enemyUnits.length)]
        nextRival = { ...nextRival, board: nextRival.board.map((unit, idx) => idx === target && unit ? { ...unit, exhausted: true } : unit) }
        const frozen = nextRival.board[target]
        nextLog = pushLog(nextLog, `${card.name} freezes ${frozen?.name ?? 'a unit'}.`)
      }
    }
  }

  if (card.effect === 'silence') {
    nextRival = { ...nextRival, board: nextRival.board.map((unit) => unit ? { ...unit, effect: undefined } : null) }
    nextLog = pushLog(nextLog, `${card.name} silences all enemy units.`)
    if (card.id === 'abyssal-tyrant') {
      nextRival = { ...nextRival, health: nextRival.health - 2 }
      nextLog = pushLog(nextLog, `${card.name} blasts the enemy hero for 2.`)
    }
  }

  if (card.effect === 'summon') {
    const emptyLanes = nextActor.board.map((u, i) => (u === null ? i : -1)).filter((i) => i !== -1)
    if (card.id === 'necro-sage') {
      for (const lane of emptyLanes) {
        nextActor = { ...nextActor, board: nextActor.board.map((unit, idx) => idx === lane ? summonUnit({ ...card, id: 'token-ghoul', name: 'Ghoul', cost: 0, attack: 2, health: 2, icon: '💀', text: 'Summoned token.', effect: undefined, instanceId: `token-ghoul-${lane}-${Math.random().toString(36).slice(2, 8)}` }) : unit) }
      }
      nextLog = pushLog(nextLog, `${card.name} raises ghouls from the grave.`)
    } else if (emptyLanes.length > 0) {
      const lane = emptyLanes[0]
      nextActor = { ...nextActor, board: nextActor.board.map((unit, idx) => idx === lane ? summonUnit({ ...card, id: 'token-spark', name: 'Spark', cost: 0, attack: 1, health: 1, icon: '⚡', text: 'Summoned token.', effect: undefined, instanceId: `token-spark-${lane}-${Math.random().toString(36).slice(2, 8)}` }) : unit) }
      nextLog = pushLog(nextLog, `${card.name} conjures a Spark.`)
    }
  }

  // ─── Legendary/Epic special effects ───
  if (card.id === 'nether-witch' || card.id === 'storm-titan') {
    nextActor = drawCards(nextActor, 1)
    nextLog = pushLog(nextLog, `${card.name} also draws a card from the blast impact.`)
  }
  if (card.id === 'fire-imp') {
    nextRival = { ...nextRival, health: nextRival.health + 1 }
    nextLog = pushLog(nextLog, `${card.name}'s flame sears for 1.`)
  }
  if (card.id === 'iron-clad') {
    nextActor = { ...nextActor, health: nextActor.health + 2 }
    nextLog = pushLog(nextLog, `${card.name} reinforces the hero with +2 armor.`)
  }
  if (card.id === 'phoenix-ascendant') {
    nextLog = pushLog(nextLog, `${card.name} rises — deathrattle: 3 damage to enemy hero.`)
  }
  if (card.id === 'shadow-assassin') {
    nextLog = pushLog(nextLog, `${card.name} lurks — lifesteal active.`)
  }
  if (card.id === 'glacial-colossus') {
    const unit = nextActor.board[firstOpenLane]
    if (unit) {
      nextActor = { ...nextActor, board: nextActor.board.map((u, i) => i === firstOpenLane && u ? { ...u, effect: 'guard' as CardEffect } : u) }
    }
    nextLog = pushLog(nextLog, `${card.name} stands as an immovable guardian of ice.`)
  }
  if (card.id === 'velara-the-lifebinder') {
    nextActor = { ...nextActor, health: STARTING_HEALTH }
    nextActor = { ...nextActor, board: nextActor.board.map((unit) => unit ? { ...unit, attack: unit.attack + 2 } : null) }
    nextLog = pushLog(nextLog, `${card.name} restores the hero and empowers all allies.`)
  }
  if (card.id === 'malachar-the-undying') {
    const emptyLanes = nextActor.board.map((u, i) => (u === null ? i : -1)).filter((i) => i !== -1)
    for (const lane of emptyLanes) {
      nextActor = { ...nextActor, board: nextActor.board.map((unit, idx) => idx === lane ? summonUnit({ ...card, id: 'token-wraith', name: 'Wraith', cost: 0, attack: 3, health: 3, icon: '👻', text: 'Summoned by Malachar.', effect: undefined, instanceId: `token-wraith-${lane}-${Math.random().toString(36).slice(2, 8)}` }) : unit) }
    }
    nextLog = pushLog(nextLog, `${card.name} summons spectral wraiths from the void.`)
  }
  if (card.id === 'kronos-the-forgemaster') {
    nextActor = { ...nextActor, health: nextActor.health + 5, board: nextActor.board.map((unit) => unit ? { ...unit, attack: unit.attack + 3 } : null) }
    nextLog = pushLog(nextLog, `${card.name} forges +3 attack for all and +5 armor for the hero.`)
  }
  if (card.id === 'aethon-runekeeper') {
    nextActor = drawCards(nextActor, 3)
    nextActor = { ...nextActor, momentum: Math.min(10, nextActor.momentum + 3) }
    nextLog = pushLog(nextLog, `${card.name} unleashes the starless litany: 3 draws, 3 Momentum.`)
  }
  if (card.id === 'drakarion-the-eternal') {
    nextRival = { ...nextRival, board: nextRival.board.map((unit) => { if (!unit) return null; const damaged = { ...unit, currentHealth: unit.currentHealth - card.attack }; return damaged.currentHealth > 0 ? damaged : null }) }
    nextLog = pushLog(nextLog, `${card.name} cleaves all enemy units with dragonfire.`)
  }
  if (card.id === 'zephyr-world-breaker') {
    nextRival = { ...nextRival, health: nextRival.health - 4 }
    const unit = nextActor.board[firstOpenLane]
    if (unit) {
      nextActor = { ...nextActor, board: nextActor.board.map((u, i) => i === firstOpenLane && u ? { ...u, effect: 'guard' as CardEffect } : u) }
    }
    nextLog = pushLog(nextLog, `${card.name} shatters the world: 4 damage to enemy hero.`)
  }
  if (card.id === 'druid-elder') {
    nextActor = { ...nextActor, health: Math.min(STARTING_HEALTH, nextActor.health + 4) }
    nextActor = { ...nextActor, board: nextActor.board.map((unit) => unit ? { ...unit, currentHealth: unit.currentHealth + 1, health: unit.health + 1 } : null) }
    nextLog = pushLog(nextLog, `${card.name} heals the hero and bolsters all allies.`)
  }
  if (card.id === 'void-empress') {
    nextActor = { ...nextActor, board: nextActor.board.map((unit) => unit ? { ...unit, attack: unit.attack + 2 } : null) }
    nextLog = pushLog(nextLog, `${card.name} empowers all units with +2 attack.`)
  }
  if (card.id === 'arcane-golem') {
    nextActor = { ...nextActor, momentum: Math.min(10, nextActor.momentum + 3) }
    nextActor = drawCards(nextActor, 1)
    nextLog = pushLog(nextLog, `${card.name} grants 3 Momentum and draws a card.`)
  }
  if (card.id === 'ancient-hydra') {
    nextRival = { ...nextRival, board: nextRival.board.map((unit) => { if (!unit) return null; const damaged = { ...unit, currentHealth: unit.currentHealth - card.attack }; return damaged.currentHealth > 0 ? damaged : null }) }
    const unit = nextActor.board[firstOpenLane]
    if (unit) {
      nextActor = { ...nextActor, board: nextActor.board.map((u, i) => i === firstOpenLane && u ? { ...u, effect: 'fury' as CardEffect } : u) }
    }
    nextLog = pushLog(nextLog, `${card.name} cleaves all lanes and grows with fury.`)
  }
  if (card.id === 'storm-shaman') {
    nextRival = { ...nextRival, health: nextRival.health - 1 }
    nextLog = pushLog(nextLog, `${card.name}'s storm rages for 3 total.`)
  }
  if (card.id === 'bone-collector') {
    const stolen = Math.min(nextRival.momentum, 1)
    nextRival = { ...nextRival, momentum: nextRival.momentum - stolen }
    nextActor = { ...nextActor, momentum: Math.min(10, nextActor.momentum + stolen) }
    nextLog = pushLog(nextLog, `${card.name} drains 2 total Momentum.`)
  }

  return applySides(base, side, nextActor, nextRival, nextLog)
}

function castMomentumBurst(base: GameState, side: BattleSide): GameState {
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

function attack(base: GameState, side: BattleSide, attackerIndex: number, target: number | 'hero'): GameState {
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
  if (guardLock && (target === 'hero' || rival.board[target]?.effect !== 'guard')) {
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
      updatedAttacker.effect === 'fury'
        ? { ...updatedAttacker, attack: updatedAttacker.attack + 1 }
        : updatedAttacker

    nextRival = { ...nextRival, health: nextRival.health - updatedAttacker.attack }

    if (updatedAttacker.effect === 'lifesteal' || updatedAttacker.id === 'shadow-assassin') {
      nextActor = { ...nextActor, health: Math.min(STARTING_HEALTH, nextActor.health + updatedAttacker.attack) }
      nextLog = pushLog(nextLog, `${updatedAttacker.name} steals ${updatedAttacker.attack} life.`)
    }

    nextLog = pushLog(nextLog, `${actor.name}'s ${updatedAttacker.name} hits ${nextRival.name} for ${updatedAttacker.attack}.`)

    if (updatedAttacker.effect === 'fury') {
      nextLog = pushLog(nextLog, `${updatedAttacker.name} grows stronger from Fury.`)
    }
  } else {
    const defender = rival.board[target]
    if (!defender) return base

    let damagedAttacker: Unit = { ...attacker, exhausted: true, currentHealth: attacker.currentHealth - defender.attack }
    const damagedDefender: Unit = { ...defender, currentHealth: defender.currentHealth - attacker.attack }

    if (damagedAttacker.currentHealth > 0 && damagedAttacker.currentHealth < attacker.currentHealth && damagedAttacker.effect === 'enrage') {
      damagedAttacker = { ...damagedAttacker, attack: damagedAttacker.attack + 2 }
      nextLog = pushLog(nextLog, `${damagedAttacker.name} enters a furious enrage! +2 attack.`)
    }

    if (damagedAttacker.currentHealth > 0 && damagedAttacker.effect === 'fury') {
      damagedAttacker = { ...damagedAttacker, attack: damagedAttacker.attack + 1 }
      nextLog = pushLog(nextLog, `${damagedAttacker.name} survives and gains +1 attack.`)
    }

    if ((attacker.effect === 'lifesteal' || attacker.id === 'shadow-assassin') && damagedDefender.currentHealth < defender.currentHealth) {
      const healAmt = Math.min(attacker.attack, defender.currentHealth)
      nextActor = { ...nextActor, health: Math.min(STARTING_HEALTH, nextActor.health + healAmt) }
      nextLog = pushLog(nextLog, `${attacker.name} steals ${healAmt} life.`)
    }

    if ((attacker.effect === 'overwhelm' || attacker.id === 'iron-juggernaut') && damagedDefender.currentHealth <= 0) {
      const excess = Math.abs(damagedDefender.currentHealth)
      if (excess > 0) {
        nextRival = { ...nextRival, health: nextRival.health - excess }
        nextLog = pushLog(nextLog, `${attacker.name} overwhelms for ${excess} to the hero.`)
      }
    }

    if (damagedDefender.currentHealth <= 0 && defender.effect === 'deathrattle') {
      if (defender.id === 'ghost-knight') {
        nextActor = { ...nextActor, health: nextActor.health - 2 }
        nextLog = pushLog(nextLog, `${defender.name}'s spirit lashes out for 2 damage.`)
      }
      if (defender.id === 'lava-hound') {
        nextActor = { ...nextActor, board: actorBoard.map((unit) => { if (!unit) return null; const damaged = { ...unit, currentHealth: unit.currentHealth - 3 }; return damaged.currentHealth > 0 ? damaged : null }) }
        nextLog = pushLog(nextLog, `${defender.name} erupts, dealing 3 to all enemy units.`)
      }
    }
    if (damagedAttacker.currentHealth <= 0 && attacker.effect === 'deathrattle') {
      if (attacker.id === 'ghost-knight') {
        nextRival = { ...nextRival, health: nextRival.health - 2 }
        nextLog = pushLog(nextLog, `${attacker.name}'s spirit lashes out for 2 damage.`)
      }
      if (attacker.id === 'lava-hound') {
        nextRival = { ...nextRival, board: rivalBoard.map((unit) => { if (!unit) return null; const damaged = { ...unit, currentHealth: unit.currentHealth - 3 }; return damaged.currentHealth > 0 ? damaged : null }) }
        nextLog = pushLog(nextLog, `${attacker.name} erupts, dealing 3 to all enemy units.`)
      }
      if (attacker.id === 'phoenix-ascendant') {
        nextRival = { ...nextRival, health: nextRival.health - 3 }
        nextLog = pushLog(nextLog, `${attacker.name} erupts in flame: 3 to the enemy hero.`)
      }
    }

    actorBoard[attackerIndex] = damagedAttacker.currentHealth > 0 ? damagedAttacker : null
    rivalBoard[target] = damagedDefender.currentHealth > 0 ? damagedDefender : null

    nextLog = pushLog(nextLog, `${attacker.name} clashes with ${defender.name}.`)
  }

  nextActor = { ...nextActor, board: actorBoard }
  nextRival = { ...nextRival, board: rivalBoard }

  return applySides(base, side, nextActor, nextRival, nextLog)
}

function highestPlayableIndex(hand: CardInstance[], mana: number): number {
  let bestIndex = -1

  hand.forEach((card, index) => {
    if (card.cost <= mana && (bestIndex === -1 || card.cost > hand[bestIndex].cost)) {
      bestIndex = index
    }
  })

  return bestIndex
}

function chooseEnemyTarget(game: GameState, attacker: Unit): number | 'hero' {
  const guardLane = game.player.board.findIndex((unit) => unit?.effect === 'guard')
  if (guardLane !== -1) {
    return guardLane
  }

  if (game.player.health <= attacker.attack) {
    return 'hero'
  }

  const easyTrade = game.player.board.findIndex(
    (unit) => unit !== null && unit.currentHealth <= attacker.attack,
  )

  return easyTrade !== -1 ? easyTrade : 'hero'
}

function passTurn(base: GameState): GameState {
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

type EnemyStep = { state: GameState; label: string }

function generateEnemyTurnSteps(base: GameState): EnemyStep[] {
  if (base.winner) return [{ state: base, label: 'Game over' }]

  const steps: EnemyStep[] = []
  let game = passTurn(base)
  steps.push({ state: game, label: `${game.enemy.name} begins their turn.` })

  if (game.turn !== 'enemy' || game.winner) return steps

  if (game.enemy.momentum >= 3 && (game.player.health <= 12 || game.enemy.hand.length === 0)) {
    game = castMomentumBurst(game, 'enemy')
    steps.push({ state: game, label: `${game.enemy.name} unleashes Momentum Burst!` })
  }

  while (true) {
    const playableIndex = highestPlayableIndex(game.enemy.hand, game.enemy.mana)
    const boardFull = game.enemy.board.every((slot) => slot !== null)
    if (playableIndex === -1 || boardFull || game.winner) break
    const card = game.enemy.hand[playableIndex]
    game = playCard(game, 'enemy', playableIndex)
    steps.push({ state: game, label: `${game.enemy.name} plays ${card.icon} ${card.name}.` })
  }

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const attacker = game.enemy.board[index]
    if (!attacker || attacker.exhausted || game.winner) continue
    const target = chooseEnemyTarget(game, attacker)
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

function App() {
  const savedDeckConfig = readStoredValue<DeckConfig>(STORAGE_KEYS.deck, DEFAULT_DECK_CONFIG)
  const savedMode = readStoredValue<GameMode>(STORAGE_KEYS.mode, 'ai')

  // ─── Auth state ───────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState(() => readStoredValue(STORAGE_KEYS.authToken, ''))
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login')
  const [authForm, setAuthForm] = useState({ username: '', password: '', displayName: '' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  // ─── Server-authoritative player state ────────────────────────────────
  const [serverProfile, setServerProfile] = useState<ServerProfile | null>(null)
  const runes = serverProfile?.runes ?? 0
  const seasonRating = serverProfile?.seasonRating ?? 1200
  const record = { wins: serverProfile?.wins ?? 0, losses: serverProfile?.losses ?? 0, streak: serverProfile?.streak ?? 0 }
  const ownedThemes = serverProfile?.ownedThemes ?? ['royal'] as CosmeticTheme[]
  const selectedTheme = (serverProfile?.selectedTheme ?? 'royal') as CosmeticTheme
  const lastDailyClaim = serverProfile?.lastDaily ?? ''

  // ─── Local game/UI state ──────────────────────────────────────────────
  const [deckConfig, setDeckConfig] = useState<DeckConfig>(savedDeckConfig)
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home')
  const [preferredMode, setPreferredMode] = useState<GameMode>(savedMode)
  const [lobbyCode, setLobbyCode] = useState(() => makeLobbyCode())
  const [game, setGame] = useState<GameState>(() => createGame(savedMode, savedDeckConfig))
  const [selectedAttacker, setSelectedAttacker] = useState<number | null>(null)
  const [queueState, setQueueState] = useState<QueueState>('idle')
  const [queueSeconds, setQueueSeconds] = useState(0)
  const [queuedOpponent, setQueuedOpponent] = useState<OpponentProfile | null>(null)
  const [resolvedMatchKey, setResolvedMatchKey] = useState('')
  const [socketClient, setSocketClient] = useState<Socket | null>(null)
  const [enemyTurnActive, setEnemyTurnActive] = useState(false)
  const [enemyTurnLabel, setEnemyTurnLabel] = useState('')
  const [backendOnline, setBackendOnline] = useState(false)
  const [, setMotd] = useState('Queue up for ranked arena play.')
  const [dailyQuest, setDailyQuest] = useState('Win 1 ranked arena match')
  const [featuredMode, setFeaturedMode] = useState('Ranked Blitz')
  const [, setMaintenanceMode] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => readStoredValue(STORAGE_KEYS.sound, true))
  const [analyticsConsent, setAnalyticsConsent] = useState(() =>
    readStoredValue(STORAGE_KEYS.analyticsConsent, true),
  )
  const [visitorId] = useState(() => readStoredValue(STORAGE_KEYS.visitor, createAnonymousId()))
  const [sessionId] = useState(() => `session-${Math.random().toString(36).slice(2, 10)}`)
  const [installPromptEvent, setInstallPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [toastMessage, setToastMessage] = useState('Ready your deck and enter the arena.')
  const [complaintForm, setComplaintForm] = useState<ComplaintFormState>({
    category: 'gameplay',
    severity: 'normal',
    summary: '',
    details: '',
  })
  const [complaintStatus, setComplaintStatus] = useState('No issue reports submitted in this session.')
  const [adminKey, setAdminKey] = useState('')
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [battleIntroVisible, setBattleIntroVisible] = useState(false)
  const [rewardOverlayVisible, setRewardOverlayVisible] = useState(false)
  const [adminSettings, setAdminSettings] = useState({
    motd: 'Queue up for ranked arena play.',
    quest: 'Win 1 ranked arena match',
    featuredMode: 'Ranked Blitz',
    maintenanceMode: false,
  })

  const sendAnalytics = useCallback(
    async (type: string, meta: Record<string, unknown> = {}, route = 'home') => {
      if (!analyticsConsent) {
        return
      }

      try {
        await fetch(`${ARENA_URL}/api/analytics/track`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            visitorId,
            sessionId,
            type,
            route,
            meta,
          }),
        })
      } catch {
        // analytics is best-effort only
      }
    },
    [analyticsConsent, sessionId, visitorId],
  )

  // ─── Auth: restore session on mount ──────────────────────────────────────
  useEffect(() => {
    if (!authToken) return
    void authFetch('/api/me', authToken)
      .then((r) => {
        if (!r.ok) throw new Error('expired')
        return r.json()
      })
      .then((data: { ok: boolean; profile?: ServerProfile }) => {
        if (data.ok && data.profile) {
          setServerProfile(data.profile)
          setLoggedIn(true)
          if (data.profile.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
            setDeckConfig(data.profile.deckConfig)
          }
        } else {
          setAuthToken('')
        }
      })
      .catch(() => setAuthToken(''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAuth(event: FormEvent) {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    const endpoint = authScreen === 'signup' ? '/api/auth/signup' : '/api/auth/login'
    const body: Record<string, string> = {
      username: authForm.username.trim(),
      password: authForm.password,
    }
    if (authScreen === 'signup') {
      body.displayName = authForm.displayName.trim() || authForm.username.trim()
      body.deviceFingerprint = getDeviceFingerprint()
    }

    try {
      const response = await fetch(`${ARENA_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json() as { ok: boolean; error?: string; token?: string; profile?: ServerProfile }

      if (!data.ok) {
        setAuthError(data.error ?? 'Authentication failed.')
        setAuthLoading(false)
        return
      }

      setAuthToken(data.token ?? '')
      setServerProfile(data.profile ?? null)
      setLoggedIn(true)
      if (data.profile?.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
        setDeckConfig(data.profile.deckConfig)
      }
      setAuthError('')
      setToastMessage(`Welcome${data.profile?.username ? ', ' + data.profile.username : ''}!`)
    } catch {
      setAuthError('Network error. Please try again.')
    }

    setAuthLoading(false)
  }

  function handleLogout() {
    if (authToken) {
      void authFetch('/api/auth/logout', authToken, { method: 'POST' }).catch(() => {})
    }
    setAuthToken('')
    setServerProfile(null)
    setLoggedIn(false)
    setToastMessage('Logged out.')
  }

  useEffect(() => {
    const socket = io(ARENA_URL, { autoConnect: true })
    setSocketClient(socket)

    socket.on('connect', () => {
      setBackendOnline(true)
    })

    socket.on('disconnect', () => {
      setBackendOnline(false)
    })

    socket.on('server:hello', (payload: { message: string }) => {
      setMotd(payload.message)
    })

    socket.on(
      'server:profileUpdated',
      (payload: { motd?: string; quest?: string; featuredMode?: string; maintenanceMode?: boolean }) => {
        if (payload.motd) {
          setMotd(payload.motd)
        }

        if (payload.quest) {
          setDailyQuest(payload.quest)
        }

        if (payload.featuredMode) {
          setFeaturedMode(payload.featuredMode)
        }

        setMaintenanceMode(Boolean(payload.maintenanceMode))
      },
    )

    socket.on(
      'queue:matched',
      (payload: { roomId: string; opponent: OpponentProfile }) => {
        setQueuedOpponent(payload.opponent)
        setQueueState('found')
        setLobbyCode(payload.roomId.toUpperCase())
        setToastMessage(`Match found against ${payload.opponent.name}.`)
      },
    )

    socket.on('room:emote', (payload: { emote: string; from: string }) => {
      setToastMessage(`${payload.from} reacts ${payload.emote}`)
      setGame((current) => ({
        ...current,
        log: [`${payload.from} reacts ${payload.emote}`, ...current.log].slice(0, 10),
      }))
    })

    socket.on('room:action', (payload: { action: { type: string; index?: number; target?: number | 'hero' } }) => {
      const { action } = payload
      setGame((current) => {
        if (current.winner) return current
        if (action.type === 'playCard' && action.index !== undefined) {
          return playCard(current, current.turn, action.index)
        }
        if (action.type === 'attack' && action.index !== undefined && action.target !== undefined) {
          return attack(current, current.turn, action.index, action.target)
        }
        if (action.type === 'burst') {
          return castMomentumBurst(current, current.turn)
        }
        if (action.type === 'endTurn') {
          return passTurn(current)
        }
        return current
      })
    })

    socket.on('room:gameOver', (payload: { winner: string }) => {
      setToastMessage(payload.winner === 'player' ? 'Your opponent won!' : 'You won!')
    })

    void fetch(`${ARENA_URL}/api/profile`)
      .then((response) => response.json())
      .then(
        (data: {
          motd?: string
          quest?: string
          featuredMode?: string
          maintenanceMode?: boolean
        }) => {
          if (data.motd) {
            setMotd(data.motd)
          }

          if (data.quest) {
            setDailyQuest(data.quest)
          }

          if (data.featuredMode) {
            setFeaturedMode(data.featuredMode)
          }

          setMaintenanceMode(Boolean(data.maintenanceMode))
          setAdminSettings({
            motd: data.motd ?? 'Queue up for ranked arena play.',
            quest: data.quest ?? 'Win 1 ranked arena match',
            featuredMode: data.featuredMode ?? 'Ranked Blitz',
            maintenanceMode: Boolean(data.maintenanceMode),
          })
        },
      )
      .catch(() => {
        setBackendOnline(false)
      })

    return () => {
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (queueState !== 'searching') {
      return undefined
    }

    const tick = window.setInterval(() => {
      setQueueSeconds((seconds) => seconds + 1)
    }, 1000)

    let resolve: number | undefined

    if (!backendOnline) {
      resolve = window.setTimeout(() => {
        setQueuedOpponent(pickOpponent())
        setQueueState('found')
      }, 2600)
    }

    return () => {
      window.clearInterval(tick)
      if (resolve) {
        window.clearTimeout(resolve)
      }
    }
  }, [queueState, backendOnline])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(STORAGE_KEYS.deck, JSON.stringify(deckConfig))
    window.localStorage.setItem(STORAGE_KEYS.sound, JSON.stringify(soundEnabled))
    window.localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify(preferredMode))
    window.localStorage.setItem(STORAGE_KEYS.visitor, JSON.stringify(visitorId))
    window.localStorage.setItem(STORAGE_KEYS.analyticsConsent, JSON.stringify(analyticsConsent))
    window.localStorage.setItem(STORAGE_KEYS.authToken, JSON.stringify(authToken))
  }, [
    deckConfig,
    soundEnabled,
    preferredMode,
    visitorId,
    analyticsConsent,
    authToken,
  ])

  // Sync deck config to server when changed (debounced)
  useEffect(() => {
    if (!authToken || !loggedIn) return
    const timer = window.setTimeout(() => {
      void authFetch('/api/me/deck', authToken, { method: 'POST', body: { deckConfig } }).catch(() => {})
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [deckConfig, authToken, loggedIn])

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPromptEvent(event as InstallPromptEvent)
      setToastMessage('Install Fractured Arcanum for a faster home-screen launch.')
    }

    const handleInstalled = () => {
      setInstallPromptEvent(null)
      setToastMessage('Fractured Arcanum is installed and ready to play.')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (queueState === 'found') {
      playSound('match', soundEnabled)
      pulseFeedback(20)
    }
  }, [queueState, soundEnabled])

  useEffect(() => {
    if (activeScreen !== 'battle') {
      setBattleIntroVisible(false)
      return
    }

    setBattleIntroVisible(true)
    const timer = window.setTimeout(() => {
      setBattleIntroVisible(false)
    }, 1600)

    return () => {
      window.clearTimeout(timer)
    }
  }, [activeScreen, game.turnNumber, game.enemy.name])

  useEffect(() => {
    void sendAnalytics(
      'page_view',
      {
        screen: getScreenBucket(),
        mode: game.mode,
      },
      'home',
    )
  }, [game.mode, sendAnalytics])

  useEffect(() => {
    if (game.winner === 'player') {
      playSound('win', soundEnabled)
      setRewardOverlayVisible(true)
    } else if (game.winner === 'enemy') {
      playSound('lose', soundEnabled)
      setRewardOverlayVisible(false)
    } else if (!game.winner) {
      setRewardOverlayVisible(false)
    }
  }, [game.winner, soundEnabled])

  useEffect(() => {
    if (!game.winner) {
      return
    }

    const matchKey = `${game.enemy.name}-${game.turnNumber}-${game.winner}`
    if (matchKey === resolvedMatchKey) {
      return
    }

    setResolvedMatchKey(matchKey)
    void sendAnalytics(
      'match_complete',
      {
        winner: game.winner,
        mode: game.mode,
        turnNumber: game.turnNumber,
      },
      'match',
    )

    if (authToken) {
      const result = game.winner === 'player' ? 'win' : game.winner === 'enemy' ? 'loss' : 'draw'
      void authFetch('/api/match/complete', authToken, {
        method: 'POST',
        body: { opponent: game.enemy.name, mode: game.mode, result, turns: game.turnNumber },
      })
        .then((r) => r.json())
        .then((data: { ok: boolean; runes?: number; seasonRating?: number; wins?: number; losses?: number; streak?: number; runesEarned?: number }) => {
          if (data.ok) {
            setServerProfile((prev) =>
              prev
                ? {
                    ...prev,
                    runes: data.runes ?? prev.runes,
                    seasonRating: data.seasonRating ?? prev.seasonRating,
                    wins: data.wins ?? prev.wins,
                    losses: data.losses ?? prev.losses,
                    streak: data.streak ?? prev.streak,
                  }
                : prev,
            )
          }
        })
        .catch(() => {})
    }
  }, [game, resolvedMatchKey, sendAnalytics, authToken])

  const activeSide = game.turn
  const defendingSide = otherSide(activeSide)
  const activePlayer = game[activeSide]
  const defendingPlayer = game[defendingSide]
  const activeBoardHasOpenLane = activePlayer.board.some((slot) => slot === null)
  const selectedDeckSize = getDeckSize(deckConfig)
  const deckReady = selectedDeckSize >= MIN_DECK_SIZE
  const defenderHasGuard = boardHasGuard(defendingPlayer.board)
  const rankLabel = getRankLabel(seasonRating)
  const totalGames = record.wins + record.losses
  const winRate = totalGames > 0 ? Math.round((record.wins / totalGames) * 100) : 0
  const previousRankTarget =
    seasonRating < 1150 ? 1000 : seasonRating < 1300 ? 1150 : seasonRating < 1500 ? 1300 : 1500
  const nextRankTarget =
    seasonRating < 1150 ? 1150 : seasonRating < 1300 ? 1300 : seasonRating < 1500 ? 1500 : 1700
  const rankProgress = Math.min(
    100,
    Math.round(((seasonRating - previousRankTarget) / (nextRankTarget - previousRankTarget)) * 100),
  )
  const nextRewardLabel =
    seasonRating >= 1500 ? 'Champion Vault' : seasonRating >= 1300 ? 'Gold Chest' : seasonRating >= 1150 ? 'Silver Cache' : 'Bronze Bundle'
  const todayKey = new Date().toISOString().slice(0, 10)
  const canClaimDailyReward = lastDailyClaim !== todayKey

  const screenTitle =
    activeScreen === 'home'
      ? 'Arena Home'
      : activeScreen === 'deck'
        ? 'Deck Forge'
        : activeScreen === 'battle'
          ? 'Battlefield'
          : activeScreen === 'vault'
            ? 'Vault'
            : 'Operations'


  function openScreen(screen: AppScreen) {
    playSound('tap', soundEnabled)
    setActiveScreen(screen)
  }

  function handleClaimDailyReward() {
    if (!canClaimDailyReward || !authToken) {
      setToastMessage(authToken ? 'The daily reward has already been claimed today.' : 'Log in to claim daily rewards.')
      return
    }

    playSound('win', soundEnabled)
    pulseFeedback(18)
    void authFetch('/api/me/daily', authToken, { method: 'POST' })
      .then((r) => r.json())
      .then((data: { ok: boolean; error?: string; runes?: number; totalEarned?: number }) => {
        if (data.ok) {
          setServerProfile((prev) => prev ? { ...prev, runes: data.runes ?? prev.runes, lastDaily: todayKey, totalEarned: data.totalEarned ?? prev.totalEarned } : prev)
          setToastMessage('Daily reward claimed: +50 Shards.')
        } else {
          setToastMessage(data.error ?? 'Could not claim daily reward.')
        }
      })
      .catch(() => setToastMessage('Network error claiming daily reward.'))
    void sendAnalytics('reward_claim', { amount: 50, currency: 'shards' }, 'vault')
  }

  function handleEquipTheme(themeId: CosmeticTheme, cost: number) {
    if (!authToken) {
      setToastMessage('Log in to use cosmetic themes.')
      return
    }

    const alreadyOwned = ownedThemes.includes(themeId)

    if (!alreadyOwned && runes < cost) {
      setToastMessage('Not enough Shards yet for that cosmetic theme.')
      return
    }

    if (!alreadyOwned) {
      void authFetch('/api/shop/theme', authToken, { method: 'POST', body: { themeId } })
        .then((r) => r.json())
        .then((data: { ok: boolean; error?: string; runes?: number; ownedThemes?: CosmeticTheme[] }) => {
          if (data.ok) {
            setServerProfile((prev) =>
              prev ? {
                ...prev,
                runes: data.runes ?? prev.runes,
                ownedThemes: data.ownedThemes ?? prev.ownedThemes,
                selectedTheme: themeId,
              } : prev,
            )
            setToastMessage(`${THEME_OFFERS.find((item) => item.id === themeId)?.name ?? 'Theme'} unlocked.`)
          } else {
            setToastMessage(data.error ?? 'Purchase failed.')
          }
        })
        .catch(() => setToastMessage('Network error purchasing theme.'))
    } else {
      void authFetch('/api/me/theme', authToken, { method: 'POST', body: { themeId } })
        .then((r) => r.json())
        .then((data: { ok: boolean }) => {
          if (data.ok) {
            setServerProfile((prev) => prev ? { ...prev, selectedTheme: themeId } : prev)
          }
        })
        .catch(() => {})
      setToastMessage(`${THEME_OFFERS.find((item) => item.id === themeId)?.name ?? 'Theme'} equipped.`)
    }

    void sendAnalytics('cosmetic_equip', { themeId }, 'vault')
  }

  async function refreshAdminOverview(key = adminKey) {
    if (!key.trim()) {
      setAdminError('Enter the admin key to open the operations console.')
      return
    }

    setAdminLoading(true)

    try {
      const response = await fetch(`${ARENA_URL}/api/admin/overview`, {
        headers: {
          'x-admin-key': key.trim(),
        },
      })

      if (!response.ok) {
        throw new Error('Admin access denied')
      }

      const data = (await response.json()) as AdminOverview
      setAdminOverview(data)
      setAdminSettings(data.settings)
      setAdminError('')
    } catch {
      setAdminOverview(null)
      setAdminError('Admin access failed. Check the key and try again.')
    } finally {
      setAdminLoading(false)
    }
  }

  async function handleSubmitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!complaintForm.summary.trim() || !complaintForm.details.trim()) {
      setComplaintStatus('Add both a short summary and clear details before sending the report.')
      return
    }

    try {
      const response = await fetch(`${ARENA_URL}/api/complaints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visitorId,
          sessionId,
          page: 'arena',
          ...complaintForm,
        }),
      })

      const data = (await response.json()) as { ok?: boolean; complaintId?: string; message?: string }

      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? 'Complaint submission failed')
      }

      setComplaintStatus(`Report ${data.complaintId} submitted for review.`)
      setToastMessage(`Support ticket ${data.complaintId} created.`)
      setComplaintForm({
        category: 'gameplay',
        severity: 'normal',
        summary: '',
        details: '',
      })
    } catch {
      setComplaintStatus('The report could not be submitted right now. Please try again.')
    }
  }

  async function handleSaveAdminSettings() {
    if (!adminKey.trim()) {
      setAdminError('Enter the admin key before saving live settings.')
      return
    }

    try {
      const response = await fetch(`${ARENA_URL}/api/admin/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey.trim(),
        },
        body: JSON.stringify(adminSettings),
      })

      if (!response.ok) {
        throw new Error('Save failed')
      }

      setMotd(adminSettings.motd)
      setDailyQuest(adminSettings.quest)
      setFeaturedMode(adminSettings.featuredMode)
      setMaintenanceMode(adminSettings.maintenanceMode)
      setToastMessage('Admin live settings updated.')
      await refreshAdminOverview(adminKey)
    } catch {
      setAdminError('The live settings could not be saved.')
    }
  }

  async function handleUpdateComplaintStatus(id: string, status: string) {
    if (!adminKey.trim()) {
      setAdminError('Enter the admin key before updating tickets.')
      return
    }

    try {
      const response = await fetch(`${ARENA_URL}/api/admin/complaints/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey.trim(),
        },
        body: JSON.stringify({
          status,
          note:
            status === 'resolved'
              ? 'Marked resolved from the in-app admin console.'
              : 'Marked investigating from the in-app admin console.',
        }),
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      setToastMessage(`Complaint ${id} updated to ${status}.`)
      await refreshAdminOverview(adminKey)
    } catch {
      setAdminError('The complaint status could not be updated.')
    }
  }

  function startMatch(mode: GameMode = preferredMode, enemyName?: string) {
    if (!deckReady) {
      setToastMessage('Finish building your deck before entering the arena.')
      setActiveScreen('deck')
      return
    }

    setPreferredMode(mode)
    setSelectedAttacker(null)
    setResolvedMatchKey('')
    setActiveScreen('battle')
    setGame(createGame(mode, deckConfig, enemyName))
    void sendAnalytics(
      'match_start',
      {
        mode,
        opponent: enemyName ?? 'Arena Bot',
        screen: getScreenBucket(),
      },
      'match',
    )
  }

  function handleModeChange(mode: GameMode) {
    playSound('tap', soundEnabled)
    setPreferredMode(mode)
    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    setToastMessage(mode === 'ai' ? 'AI skirmish ready. Tap Enter Arena to begin.' : 'Local duel ready. Tap Enter Arena to begin.')
  }

  async function handleInstallApp() {
    if (!installPromptEvent) {
      return
    }

    await installPromptEvent.prompt()
    const result = await installPromptEvent.userChoice
    setToastMessage(
      result.outcome === 'accepted'
        ? 'Installation accepted. Fractured Arcanum is being added to your device.'
        : 'Install prompt dismissed.',
    )

    if (result.outcome === 'accepted') {
      void sendAnalytics('install', { screen: getScreenBucket() }, 'install')
    }

    setInstallPromptEvent(null)
  }

  function handleSendEmote(emote: string) {
    playSound('tap', soundEnabled)
    pulseFeedback(10)
    setToastMessage(`You react ${emote}`)
    setGame((current) => ({
      ...current,
      log: [`${activePlayer.name} reacts ${emote}`, ...current.log].slice(0, 10),
    }))
    void sendAnalytics('emote', { emote }, 'social')

    if (backendOnline && socketClient?.connected) {
      socketClient.emit('room:emote', {
        roomId: lobbyCode,
        emote,
        from: activePlayer.name,
      })
    }
  }

  function handleStartQueue() {
    if (!deckReady) {
      setToastMessage('Finish your deck first so matchmaking can start.')
      setActiveScreen('deck')
      return
    }

    setPreferredMode('ai')
    setActiveScreen('battle')
    setQueueState('searching')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    void sendAnalytics(
      'queue_join',
      {
        rank: rankLabel,
        deckSize: selectedDeckSize,
        screen: getScreenBucket(),
      },
      'queue',
    )

    if (backendOnline && socketClient?.connected) {
      socketClient.emit('queue:join', {
        name: 'Rune Captain',
        rank: `${rankLabel} Division`,
      })
    }
  }

  function handleCancelQueue() {
    if (backendOnline && socketClient?.connected) {
      socketClient.emit('queue:leave')
    }

    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
  }

  function handleAcceptQueue() {
    if (!queuedOpponent) {
      return
    }

    const opponentName = queuedOpponent.name
    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    startMatch('ai', opponentName)
  }

  function handleDeckCount(cardId: string, delta: number) {
    setDeckConfig((current) => {
      const total = getDeckSize(current)
      const card = CARD_LIBRARY.find((c) => c.id === cardId)
      const maxCopies = card?.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
      const nextCount = Math.max(0, Math.min(maxCopies, (current[cardId] ?? 0) + delta))

      if (delta > 0 && total >= MAX_DECK_SIZE) {
        return current
      }

      return {
        ...current,
        [cardId]: nextCount,
      }
    })
  }

  function handleLoadPreset(name: string, config: DeckConfig) {
    playSound('tap', soundEnabled)
    setToastMessage(`${name} preset loaded.`)
    setDeckConfig(config)
  }

  function emitAction(action: Record<string, unknown>) {
    if (game.mode === 'duel' && socketClient?.connected) {
      socketClient.emit('room:action', { roomId: lobbyCode, action })
    }
  }

  function handlePlayCard(index: number) {
    if (game.winner || enemyTurnActive) {
      return
    }

    playSound('summon', soundEnabled)
    pulseFeedback(12)
    setGame((current) => playCard(current, current.turn, index))
    emitAction({ type: 'playCard', index })
  }

  function handleSelectAttacker(index: number) {
    const unit = activePlayer.board[index]

    if (game.winner || !unit || unit.exhausted) {
      return
    }

    playSound('tap', soundEnabled)
    setSelectedAttacker((current) => (current === index ? null : index))
  }

  function handleAttackTarget(target: number | 'hero') {
    if (selectedAttacker === null || game.winner || enemyTurnActive) {
      return
    }

    playSound('attack', soundEnabled)
    pulseFeedback(16)
    setGame((current) => attack(current, current.turn, selectedAttacker, target))
    emitAction({ type: 'attack', index: selectedAttacker, target })
    setSelectedAttacker(null)
  }

  function handleBurst() {
    if (game.winner || enemyTurnActive) {
      return
    }

    playSound('burst', soundEnabled)
    pulseFeedback(22)
    setGame((current) => castMomentumBurst(current, current.turn))
    emitAction({ type: 'burst' })
  }

  function handleEndTurn() {
    if (game.winner || enemyTurnActive) {
      return
    }

    playSound('tap', soundEnabled)
    setSelectedAttacker(null)

    if (game.mode !== 'ai') {
      setGame((current) => passTurn(current))
      emitAction({ type: 'endTurn' })
      return
    }

    const steps = generateEnemyTurnSteps(game)
    if (steps.length === 0) return

    setEnemyTurnActive(true)
    setEnemyTurnLabel(steps[0].label)
    setGame(steps[0].state)

    steps.slice(1).forEach((step, i) => {
      setTimeout(() => {
        setGame(step.state)
        setEnemyTurnLabel(step.label)
        if (i === steps.length - 2) {
          setTimeout(() => {
            setEnemyTurnActive(false)
            setEnemyTurnLabel('')
          }, 600)
        }
      }, (i + 1) * 700)
    })
  }

  return (
    <main className={`app-shell theme-${selectedTheme}`}>
      {/* ─── Auth gate ─────────────────────────────────────────────── */}
      {!loggedIn && (
        <div className="auth-gate">
          <div className="auth-card">
            <img className="brand-logo" src="/fractured-arcanum-logo.svg" alt="Fractured Arcanum" />
            <h1>Fractured Arcanum</h1>
            <p className="auth-tagline">Cosmic horror card battles await</p>
            <form className="auth-form" onSubmit={handleAuth}>
              {authScreen === 'signup' && (
                <label>
                  Display Name
                  <input
                    type="text"
                    placeholder="Your arena name"
                    maxLength={20}
                    value={authForm.displayName}
                    onChange={(event) => setAuthForm((f) => ({ ...f, displayName: event.target.value }))}
                  />
                </label>
              )}
              <label>
                Username
                <input
                  type="text"
                  placeholder="3–20 chars, letters/numbers/_"
                  maxLength={20}
                  autoComplete="username"
                  required
                  value={authForm.username}
                  onChange={(event) => setAuthForm((f) => ({ ...f, username: event.target.value }))}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  placeholder="8+ characters"
                  minLength={8}
                  autoComplete={authScreen === 'signup' ? 'new-password' : 'current-password'}
                  required
                  value={authForm.password}
                  onChange={(event) => setAuthForm((f) => ({ ...f, password: event.target.value }))}
                />
              </label>
              {authError && <p className="auth-error">{authError}</p>}
              <button className="primary" type="submit" disabled={authLoading}>
                {authLoading ? 'Please wait…' : authScreen === 'signup' ? 'Create Account' : 'Log In'}
              </button>
            </form>
            <p className="auth-switch">
              {authScreen === 'login' ? (
                <>
                  New here?{' '}
                  <button className="link" onClick={() => { setAuthScreen('signup'); setAuthError('') }}>
                    Create account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button className="link" onClick={() => { setAuthScreen('login'); setAuthError('') }}>
                    Log in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {loggedIn && activeScreen !== 'battle' && (
        <header className="topbar topbar-art">
          <div className="brand-block">
            <img className="brand-logo" src="/fractured-arcanum-logo.svg" alt="Fractured Arcanum" />
            <div>
              <p className="eyebrow">{screenTitle}</p>
              <h1>Fractured Arcanum</h1>
            </div>
          </div>

          <div className="top-actions">
            <span className="username-label">{serverProfile?.username ?? ''}</span>
            <button
              className="ghost"
              onClick={() => {
                playSound('tap', !soundEnabled)
                setSoundEnabled((value) => !value)
              }}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            {installPromptEvent && (
              <button className="ghost" onClick={() => void handleInstallApp()}>
                Install
              </button>
            )}
            <button className="ghost" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>
      )}

      {activeScreen === 'home' && loggedIn && (
        <section className="nav-strip section-card">
          <div className="season-progress-block">
            <div>
              <p className="eyebrow">Season of Whispers</p>
              <h2>{rankLabel} League</h2>
            </div>
            <div className="progress-column">
              <div className="progress-shell">
                <div className="progress-fill" style={{ width: `${rankProgress}%` }}></div>
              </div>
              <p className="note">{seasonRating} / {nextRankTarget} rating</p>
            </div>
          </div>
        </section>
      )}

      {battleIntroVisible && !game.winner && (
        <section className="queue-overlay intro-overlay" aria-live="polite">
          <div className="queue-modal intro-modal section-card">
            <p className="eyebrow">Fractured Arcanum Battle Intro</p>
            <h2>{game.player.name} vs {game.enemy.name}</h2>
            <p className="note">{game.mode === 'ai' ? 'The arena gates open.' : 'Pass the device and prepare for the duel.'}</p>
          </div>
        </section>
      )}

      {rewardOverlayVisible && game.winner === 'player' && (
        <section className="queue-overlay reward-overlay" aria-live="polite">
          <div className="queue-modal reward-modal section-card">
            <img className="reward-art" src="/generated/ui/reward-chest.svg" alt="Reward chest" />
            <p className="eyebrow">Victory Rewards</p>
            <h2>Season Chest Unlocked</h2>
            <div className="badges">
              <span className="badge">+25 Rating</span>
              <span className="badge">+30 Shards</span>
              <span className="badge">Win Streak {record.streak}</span>
              <span className="badge">League {rankLabel}</span>
            </div>
            <p className="note">Your crew celebrates another climb up the ranked ladder.</p>
            <div className="controls">
              <button className="primary" onClick={() => setRewardOverlayVisible(false)}>
                Claim Rewards
              </button>
              <button className="ghost" onClick={() => startMatch(game.mode)}>
                Queue Again
              </button>
            </div>
          </div>
        </section>
      )}


      {loggedIn && (<>
      <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
        <article className="section-card utility-card spotlight-card">
          <img
            className="spotlight-banner"
            src="/generated/ui/asset-forge-banner.svg"
            alt="Fractured Arcanum spotlight banner"
          />

          <div className="mode-switch">
            <button
              className={preferredMode === 'ai' ? 'primary' : 'ghost'}
              onClick={() => handleModeChange('ai')}
            >
              AI Skirmish
            </button>
            <button
              className={preferredMode === 'duel' ? 'primary' : 'ghost'}
              onClick={() => handleModeChange('duel')}
            >
              Local Duel
            </button>
          </div>

          <div className="controls">
            <button className="primary" onClick={() => startMatch()} disabled={!deckReady}>
              Enter Arena
            </button>
            <button className="secondary" onClick={handleStartQueue} disabled={!deckReady || queueState !== 'idle'}>
              Find Ranked Match
            </button>
            <button className="ghost" onClick={() => openScreen('deck')}>
              Deck Forge
            </button>
          </div>

          {queueState === 'searching' && (
            <p className="card-text">Searching for an opponent... {queueSeconds}s</p>
          )}

          {queueState === 'found' && queuedOpponent && (
            <div className="opponent-preview">
              <strong>{queuedOpponent.name}</strong>
              <span className="note">
                {queuedOpponent.rank} • {queuedOpponent.style} • {queuedOpponent.ping}ms
              </span>
              <div className="controls">
                <button className="primary" onClick={handleAcceptQueue}>Accept Match</button>
                <button className="ghost" onClick={handleCancelQueue}>Decline</button>
              </div>
            </div>
          )}

          <p className="note toast-line">{toastMessage}</p>
        </article>

        <div className="home-cards">
          <article className="section-card utility-card">
            <div className="section-head">
              <h2>Quests</h2>
              <span className="deck-status ready">Live</span>
            </div>
            <ul className="quest-list">
              <li>{record.wins >= 1 ? '✅' : '⬜'} {dailyQuest}</li>
              <li>{winRate >= 50 ? '✅' : '⬜'} 50% win rate</li>
              <li>{selectedDeckSize >= 14 ? '✅' : '⬜'} Full deck</li>
            </ul>
          </article>

          <article className="section-card utility-card">
            <div className="section-head">
              <h2>Profile</h2>
              <span className="badge">{serverProfile?.username ?? 'Guest'}</span>
            </div>
            <div className="badges">
              <span className="badge">{rankLabel}</span>
              <span className="badge">{totalGames} games</span>
              <span className="badge">{winRate}% WR</span>
              <span className="badge">{runes} 💎</span>
            </div>
          </article>
        </div>

        <div className="controls emote-row">
          {QUICK_EMOTES.map((emote) => (
            <button className="ghost emote-chip" key={emote} onClick={() => handleSendEmote(emote)}>
              {emote}
            </button>
          ))}
        </div>
      </section>

      <section className={`meta-grid deck-focus screen-panel ${activeScreen === 'deck' ? 'active' : 'hidden'}`}>
        <article className="section-card">
          <div className="section-head">
            <div>
              <h2>Deck Builder</h2>
              <p className="note">Choose 10–16 cards, with up to 3 copies of each.</p>
            </div>
            <span className={`deck-status ${deckReady ? 'ready' : 'warning'}`}>
              {deckReady ? 'Deck ready' : 'Add more cards'}
            </span>
          </div>

          <div className="controls preset-row">
            {DECK_PRESETS.map((preset) => (
              <button
                className="ghost"
                key={preset.name}
                onClick={() => handleLoadPreset(preset.name, preset.config)}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="builder-grid">
            {CARD_LIBRARY.map((card) => {
              const maxCopies = card.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
              const count = deckConfig[card.id] ?? 0
              return (
              <div className={`builder-card rarity-${card.rarity}`} key={card.id} style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}>
                <div>
                  <div className="card-art-shell">
                    <img
                      className="card-illustration"
                      src={cardArtPath(card.id)}
                      alt={`${card.name} illustration`}
                      loading="lazy"
                    />
                  </div>
                  <div className="slot-head">
                    <strong>
                      {card.icon} {card.name}
                    </strong>
                    <span className="stats">{card.cost}</span>
                  </div>
                  <div className="card-meta-row">
                    <span className="rarity-gem" style={{ color: RARITY_COLORS[card.rarity] }}>{card.rarity === 'legendary' ? '★' : card.rarity === 'epic' ? '◆' : card.rarity === 'rare' ? '◈' : '●'} {card.rarity}</span>
                    <span className="tribe-badge">{card.tribe}</span>
                  </div>
                  <p className="card-text">{card.text}</p>
                </div>

                <div className="stepper">
                  <button className="ghost mini" onClick={() => handleDeckCount(card.id, -1)}>
                    −
                  </button>
                  <span className="count-chip">{count}</span>
                  <button className="ghost mini" onClick={() => handleDeckCount(card.id, 1)} disabled={count >= maxCopies}>
                    +
                  </button>
                </div>
              </div>
              )
            })}
          </div>

          <div className="controls">
            <button className="primary" onClick={() => startMatch()} disabled={!deckReady}>
              Play With This Deck
            </button>
            <button className="secondary" onClick={handleStartQueue} disabled={!deckReady || queueState !== 'idle'}>
              Queue Ranked
            </button>
            <button className="ghost" onClick={() => openScreen('home')}>
              Back to Home
            </button>
          </div>
        </article>
      </section>

      {enemyTurnActive && (
        <div className={`enemy-turn-banner screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
          <span className="enemy-turn-label">{enemyTurnLabel}</span>
        </div>
      )}

      <section className={`battle-topbar section-card screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
        <div className="battle-heroes-compact">
          <div className="hero-compact enemy">
            <strong>{game.enemy.name}</strong>
            <span className="hero-health">❤️ {game.enemy.health}</span>
          </div>
          <div className="battle-turn-label">
            <span className="eyebrow">Turn {game.turnNumber}</span>
          </div>
          <div className="hero-compact player">
            <strong>{game.player.name}</strong>
            <span className="hero-health">❤️ {game.player.health}</span>
          </div>
        </div>

        <div className="battle-resource-row">
          <div className="pip-row">
            {Array.from({ length: Math.max(activePlayer.maxMana, 1) }).map((_, index) => (
              <span
                key={`mana-${index}`}
                className={index < activePlayer.mana ? 'pip filled' : 'pip'}
              />
            ))}
            <span className="hero-label">Mana</span>
          </div>
          <div className="pip-row">
            {Array.from({ length: 10 }).map((_, index) => (
              <span
                key={`momentum-${index}`}
                className={index < activePlayer.momentum ? 'pip momentum filled' : 'pip momentum'}
              />
            ))}
            <span className="hero-label">Momentum</span>
          </div>
        </div>

        <div className="controls">
          <button
            className="primary"
            onClick={handleBurst}
            disabled={activePlayer.momentum < 3 || Boolean(game.winner)}
          >
            Burst
          </button>
          <button className="secondary" onClick={handleEndTurn} disabled={Boolean(game.winner) || enemyTurnActive}>
            {enemyTurnActive ? 'Enemy Turn…' : 'End Turn'}
          </button>
          <button className="ghost" onClick={() => openScreen('home')}>
            Leave
          </button>
        </div>
      </section>

      <section className={`battlefield screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
        <article className="section-card">
          <div className="section-head">
            <h2>{game.enemy.name} Frontline</h2>
            <button
              className="ghost"
              onClick={() => handleAttackTarget('hero')}
              disabled={selectedAttacker === null || defenderHasGuard || Boolean(game.winner)}
            >
              Strike Hero
            </button>
          </div>

          <div className="board-grid">
            {game.enemy.board.map((unit, index) => {
              if (!unit) {
                return (
                  <div className="slot empty" key={`enemy-empty-${index}`}>
                    Empty lane
                  </div>
                )
              }

              const isSelectable = game.turn === 'enemy'
              const isSelected = isSelectable && selectedAttacker === index

              return (
                <button
                  className={[
                    'slot',
                    `rarity-${unit.rarity}`,
                    unit.effect === 'guard' ? 'guard' : '',
                    unit.exhausted ? 'exhausted' : '',
                    isSelected ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={unit.uid}
                  style={{ '--rarity-color': RARITY_COLORS[unit.rarity] } as React.CSSProperties}
                  onClick={() => (isSelectable ? handleSelectAttacker(index) : handleAttackTarget(index))}
                  disabled={Boolean(game.winner) || (isSelectable ? unit.exhausted : selectedAttacker === null)}
                >
                  <div className="slot-head">
                    <strong>
                      {unit.icon} {unit.name}
                    </strong>
                    <span className="stats">
                      {unit.attack}/{unit.currentHealth}
                    </span>
                  </div>
                  {unit.effect && <span className="effect-badge small">{EFFECT_LABELS[unit.effect] ?? unit.effect}</span>}
                  <img
                    className="unit-portrait"
                    src={cardArtPath(unit.id)}
                    alt={`${unit.name} artwork`}
                    loading="lazy"
                  />
                  <span className="note">{isSelectable ? 'Tap to attack' : 'Target this lane'}</span>
                  <span className="mini-text">{unit.text}</span>
                </button>
              )
            })}
          </div>
        </article>

        <article className="section-card">
          <div className="section-head">
            <h2>{game.player.name} Frontline</h2>
            <p className="note">Ready units can attack once each turn.</p>
          </div>

          <div className="board-grid">
            {game.player.board.map((unit, index) => {
              if (!unit) {
                return (
                  <div className="slot empty" key={`player-empty-${index}`}>
                    Open lane
                  </div>
                )
              }

              const isSelectable = game.turn === 'player'
              const isSelected = isSelectable && selectedAttacker === index

              return (
                <button
                  className={[
                    'slot',
                    `rarity-${unit.rarity}`,
                    unit.effect === 'guard' ? 'guard' : '',
                    unit.exhausted ? 'exhausted' : '',
                    isSelected ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={unit.uid}
                  style={{ '--rarity-color': RARITY_COLORS[unit.rarity] } as React.CSSProperties}
                  onClick={() => (isSelectable ? handleSelectAttacker(index) : handleAttackTarget(index))}
                  disabled={Boolean(game.winner) || (isSelectable ? unit.exhausted : selectedAttacker === null)}
                >
                  <div className="slot-head">
                    <strong>
                      {unit.icon} {unit.name}
                    </strong>
                    <span className="stats">
                      {unit.attack}/{unit.currentHealth}
                    </span>
                  </div>
                  {unit.effect && <span className="effect-badge small">{EFFECT_LABELS[unit.effect] ?? unit.effect}</span>}
                  <img
                    className="unit-portrait"
                    src={cardArtPath(unit.id)}
                    alt={`${unit.name} artwork`}
                    loading="lazy"
                  />
                  <span className="note">{isSelectable ? 'Tap to attack' : 'Target this lane'}</span>
                  <span className="mini-text">{unit.text}</span>
                </button>
              )
            })}
          </div>
        </article>
      </section>

      {game.winner && (
        <section className={`summary-card section-card screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
          <div className="section-head">
            <div>
              <h2>{game.winner === 'player' ? 'Victory Screen' : game.winner === 'enemy' ? 'Defeat Screen' : 'Draw Screen'}</h2>
              <p className="note">
                {game.winner === 'player'
                  ? 'Rewards tallied and the crowd is roaring for a rematch.'
                  : game.winner === 'enemy'
                    ? 'Review your deck, regroup, and jump straight back into the arena.'
                    : 'A close match. Adjust your list and queue again.'}
              </p>
            </div>
            <span className={`deck-status ${game.winner === 'player' ? 'ready' : 'warning'}`}>
              {game.winner === 'player' ? '+25 Rating' : game.winner === 'enemy' ? '-15 Rating' : 'Even Match'}
            </span>
          </div>

          <div className="summary-grid">
            <div className="badges">
              <span className="badge">Rank {rankLabel}</span>
              <span className="badge">Rating {seasonRating}</span>
              <span className="badge">Win Rate {winRate}%</span>
            </div>
            <div className="controls">
              <button className="primary" onClick={() => startMatch(game.mode)}>
                Play Again
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setPreferredMode('ai')
                  openScreen('home')
                }}
              >
                Back to Lobby
              </button>
            </div>
          </div>
        </section>
      )}

      <section className={`vault-grid screen-panel ${activeScreen === 'vault' ? 'active' : 'hidden'}`}>
        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Reward Vault</h2>
              <p className="note">Claim simple daily rewards and stockpile Shards for cosmetics.</p>
            </div>
            <span className="deck-status ready">Balance {runes}</span>
          </div>

          <img className="reward-art vault-hero" src="/generated/ui/reward-chest.svg" alt="Vault reward chest" />

          <div className="badges">
            <span className="badge">Next Reward {nextRewardLabel}</span>
            <span className="badge">Claim {canClaimDailyReward ? 'Ready' : 'Tomorrow'}</span>
          </div>

          <div className="controls">
            <button className="primary" onClick={handleClaimDailyReward} disabled={!canClaimDailyReward}>
              Claim Daily +50
            </button>
            <button className="ghost" onClick={() => startMatch('ai')}>
              Earn More in Battle
            </button>
          </div>
        </article>

        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Cosmetic Themes</h2>
              <p className="note">Unlock or equip visual themes for the app shell and profile framing.</p>
            </div>
            <span className="badge">Cosmetics Only</span>
          </div>

          <div className="theme-grid">
            {THEME_OFFERS.map((theme) => {
              const owned = ownedThemes.includes(theme.id)
              const equipped = selectedTheme === theme.id

              return (
                <div className="theme-offer-card" key={theme.id}>
                  <div className={`theme-swatch ${theme.id}`}></div>
                  <strong>{theme.name}</strong>
                  <p className="mini-text">{theme.note}</p>
                  <div className="badges">
                    <span className="badge">{owned ? 'Owned' : `${theme.cost} Shards`}</span>
                    {equipped && <span className="badge">Equipped</span>}
                  </div>
                  <button className={owned ? 'secondary' : 'primary'} onClick={() => handleEquipTheme(theme.id, theme.cost)}>
                    {equipped ? 'Equipped' : owned ? 'Equip Theme' : 'Unlock Theme'}
                  </button>
                </div>
              )
            })}
          </div>
        </article>

        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Simple Monetization Plan</h2>
              <p className="note">This preview keeps the game fair and monetizes only convenience-free cosmetics.</p>
            </div>
            <span className="badge">Plan Ready</span>
          </div>

          <ul className="shop-plan-list">
            <li><strong>Starter Bundle</strong> — small cosmetic pack plus bonus Shards.</li>
            <li><strong>Season Pass</strong> — extra cosmetic track, never gameplay power.</li>
            <li><strong>Board and Theme Skins</strong> — premium visuals for collectors.</li>
            <li><strong>No pay-to-win</strong> — card strength and match fairness stay equal.</li>
          </ul>
        </article>
      </section>

      <section className={`ops-grid screen-panel ${activeScreen === 'ops' ? 'active' : 'hidden'}`}>
        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Privacy and Traffic</h2>
              <p className="note">
                Anonymous-only analytics help the team monitor traffic, stability, and queue flow.
              </p>
            </div>
            <span className={`deck-status ${analyticsConsent ? 'ready' : 'warning'}`}>
              {analyticsConsent ? 'Anonymous analytics on' : 'Analytics paused'}
            </span>
          </div>

          <div className="badges">
            <span className="badge">{serverProfile?.username ?? 'Guest'} ({visitorId.slice(-6).toUpperCase()})</span>
            <span className="badge">Featured {featuredMode}</span>
            <span className="badge">{backendOnline ? 'Server Online' : 'Fallback Mode'}</span>
          </div>

          <p className="note">
            Stored data is limited to a random guest id, aggregate traffic counters, match events,
            and any complaint tickets you explicitly submit.
          </p>

          <div className="asset-preview-row">
            {CARD_LIBRARY.slice(0, 4).map((card) => (
              <img
                key={card.id}
                className="asset-preview-thumb"
                src={cardArtPath(card.id)}
                alt={`${card.name} artwork`}
                loading="lazy"
              />
            ))}
          </div>

          <div className="controls">
            <button
              className={analyticsConsent ? 'secondary' : 'primary'}
              onClick={() => {
                const nextValue = !analyticsConsent
                setAnalyticsConsent(nextValue)
                setToastMessage(
                  nextValue
                    ? 'Anonymous traffic tracking enabled for quality monitoring.'
                    : 'Anonymous traffic tracking paused on this device.',
                )
              }}
            >
              {analyticsConsent ? 'Pause Anonymous Analytics' : 'Enable Anonymous Analytics'}
            </button>
          </div>

          <p className="note toast-line">{complaintStatus}</p>
        </article>

        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Player Complaint Desk</h2>
              <p className="note">Submit gameplay bugs, fairness issues, or live service complaints.</p>
            </div>
            <span className="badge">Support</span>
          </div>

          <form className="complaint-form" onSubmit={(event) => void handleSubmitComplaint(event)}>
            <div className="form-row split-fields">
              <label className="form-field">
                <span>Category</span>
                <select
                  className="text-input"
                  value={complaintForm.category}
                  onChange={(event) =>
                    setComplaintForm((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  <option value="gameplay">Gameplay</option>
                  <option value="matchmaking">Matchmaking</option>
                  <option value="balance">Balance</option>
                  <option value="performance">Performance</option>
                  <option value="moderation">Moderation</option>
                </select>
              </label>

              <label className="form-field">
                <span>Priority</span>
                <select
                  className="text-input"
                  value={complaintForm.severity}
                  onChange={(event) =>
                    setComplaintForm((current) => ({ ...current, severity: event.target.value }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>

            <label className="form-field">
              <span>Summary</span>
              <input
                className="text-input"
                value={complaintForm.summary}
                maxLength={120}
                placeholder="Short description of the issue"
                onChange={(event) =>
                  setComplaintForm((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>

            <label className="form-field">
              <span>Details</span>
              <textarea
                className="text-input text-area"
                value={complaintForm.details}
                rows={4}
                placeholder="What happened, and how can it be reproduced?"
                onChange={(event) =>
                  setComplaintForm((current) => ({ ...current, details: event.target.value }))
                }
              />
            </label>

            <div className="controls">
              <button className="primary" type="submit">
                Send Report
              </button>
            </div>
          </form>
        </article>

        <article className="section-card admin-console">
          <img
            className="admin-banner-art"
            src="/generated/ui/admin-ops-banner.svg"
            alt="Arena operations banner"
          />

          <div className="section-head">
            <div>
              <h2>Admin Operations Console</h2>
              <p className="note">Monitor traffic, review complaints, and control live service messaging.</p>
            </div>
            <span className="badge">Admin</span>
          </div>

          <div className="admin-auth-row">
            <input
              className="text-input"
              type="password"
              value={adminKey}
              placeholder="Enter admin key"
              onChange={(event) => setAdminKey(event.target.value)}
            />
            <button className="secondary" onClick={() => void refreshAdminOverview()}>
              {adminLoading ? 'Loading…' : 'Open Console'}
            </button>
          </div>

          {adminError && <p className="note toast-line">{adminError}</p>}

          {adminOverview && (
            <>
              <div className="insight-grid">
                <div className="stat-tile">
                  <strong>{adminOverview.totals.uniqueVisitors}</strong>
                  <span>Unique Guests</span>
                </div>
                <div className="stat-tile">
                  <strong>{adminOverview.totals.pageViews}</strong>
                  <span>Page Views</span>
                </div>
                <div className="stat-tile">
                  <strong>{adminOverview.totals.matchesCompleted}</strong>
                  <span>Completed Matches</span>
                </div>
                <div className="stat-tile">
                  <strong>{adminOverview.totals.complaintsOpen}</strong>
                  <span>Open Complaints</span>
                </div>
              </div>

              <div className="admin-columns">
                <div className="admin-panel-block">
                  <h3>Traffic by Section</h3>
                  <ul className="stats-list">
                    {adminOverview.traffic.pages.slice(0, 5).map((entry) => (
                      <li key={entry.route}>
                        <span>{entry.route}</span>
                        <strong>{entry.views}</strong>
                      </li>
                    ))}
                  </ul>

                  <h3>Device Mix</h3>
                  <ul className="stats-list">
                    {adminOverview.traffic.devices.slice(0, 4).map((entry) => (
                      <li key={entry.label}>
                        <span>{entry.label}</span>
                        <strong>{entry.count}</strong>
                      </li>
                    ))}
                  </ul>

                  <h3>Traffic by Day</h3>
                  <ul className="stats-list">
                    {adminOverview.traffic.daily.slice(-5).reverse().map((entry) => (
                      <li key={entry.day}>
                        <span>{entry.day}</span>
                        <strong>{entry.views}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="admin-panel-block">
                  <h3>Live Ops Controls</h3>
                  <div className="form-stack">
                    <label className="form-field">
                      <span>Message of the day</span>
                      <input
                        className="text-input"
                        value={adminSettings.motd}
                        onChange={(event) =>
                          setAdminSettings((current) => ({ ...current, motd: event.target.value }))
                        }
                      />
                    </label>

                    <label className="form-field">
                      <span>Daily quest</span>
                      <input
                        className="text-input"
                        value={adminSettings.quest}
                        onChange={(event) =>
                          setAdminSettings((current) => ({ ...current, quest: event.target.value }))
                        }
                      />
                    </label>

                    <label className="form-field">
                      <span>Featured mode</span>
                      <input
                        className="text-input"
                        value={adminSettings.featuredMode}
                        onChange={(event) =>
                          setAdminSettings((current) => ({
                            ...current,
                            featuredMode: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={adminSettings.maintenanceMode}
                        onChange={(event) =>
                          setAdminSettings((current) => ({
                            ...current,
                            maintenanceMode: event.target.checked,
                          }))
                        }
                      />
                      <span>Maintenance mode</span>
                    </label>

                    <button className="primary" onClick={() => void handleSaveAdminSettings()}>
                      Save Live Settings
                    </button>
                  </div>
                </div>
              </div>

              <div className="admin-panel-block">
                <div className="section-head log-heading">
                  <h3>Recent Player Complaints</h3>
                  <span className="badge">Resolved {adminOverview.totals.complaintsResolved}</span>
                </div>

                <div className="ticket-list">
                  {adminOverview.complaints.length === 0 ? (
                    <p className="note">No complaints have been submitted yet.</p>
                  ) : (
                    adminOverview.complaints.slice(0, 5).map((complaint) => (
                      <div className="ticket-card" key={complaint.id}>
                        <div className="slot-head">
                          <strong>{complaint.summary}</strong>
                          <span
                            className={`queue-pill ${
                              complaint.status === 'resolved'
                                ? 'found'
                                : complaint.status === 'investigating'
                                  ? 'searching'
                                  : 'idle'
                            }`}
                          >
                            {complaint.status}
                          </span>
                        </div>
                        <p className="mini-text">{complaint.details}</p>
                        <div className="badges">
                          <span className="badge">{complaint.id}</span>
                          <span className="badge">{complaint.category}</span>
                          <span className="badge">{complaint.severity}</span>
                          <span className="badge">{formatTimestamp(complaint.createdAt)}</span>
                        </div>
                        <div className="controls">
                          <button
                            className="ghost"
                            onClick={() => void handleUpdateComplaintStatus(complaint.id, 'investigating')}
                          >
                            Investigating
                          </button>
                          <button
                            className="primary"
                            onClick={() => void handleUpdateComplaintStatus(complaint.id, 'resolved')}
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </article>
      </section>

      <section className={`hand-section screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
        <article className="section-card">
          <div className="section-head">
            <h2>{activePlayer.name} Hand</h2>
            <span className="badge">Mana {activePlayer.mana}</span>
          </div>

          <div className="hand-grid">
            {activePlayer.hand.map((card, index) => {
              const canPlay = !game.winner && activeBoardHasOpenLane && card.cost <= activePlayer.mana

              return (
                <button
                  className={['hand-card', `rarity-${card.rarity}`, canPlay ? '' : 'unplayable'].filter(Boolean).join(' ')}
                  key={card.instanceId}
                  onClick={() => handlePlayCard(index)}
                  disabled={!canPlay}
                  style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}
                >
                  <div className="card-top">
                    <span className="cost-pill">{card.cost}</span>
                    <span className="hero-label">{card.icon}</span>
                  </div>
                  <div className="card-art-shell large">
                    <img
                      className="card-illustration"
                      src={cardArtPath(card.id)}
                      alt={`${card.name} illustration`}
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <strong className="card-name">{card.name}</strong>
                    <span className="rarity-gem" style={{ color: RARITY_COLORS[card.rarity] }}>{card.rarity === 'legendary' ? '★' : card.rarity === 'epic' ? '◆' : card.rarity === 'rare' ? '◈' : '●'}</span>
                    {card.effect && <span className="effect-badge">{EFFECT_LABELS[card.effect] ?? card.effect}</span>}
                    <p className="card-text">{card.text}</p>
                  </div>
                  <div className="card-stats">
                    <span>⚔️ {card.attack}</span>
                    <span>❤️ {card.health}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </article>
      </section>

      <nav className="bottom-nav section-card" aria-label="Primary screens">
        <button className={activeScreen === 'home' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('home')}>
          🏠 Home
        </button>
        <button className={activeScreen === 'deck' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('deck')}>
          🃏 Deck
        </button>
        <button className={activeScreen === 'battle' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('battle')}>
          ⚔️ Battle
        </button>
        <button className={activeScreen === 'vault' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('vault')}>
          💎 Vault
        </button>
        <button className={activeScreen === 'ops' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('ops')}>
          📊 Ops
        </button>
      </nav>
      </>)}
    </main>
  )
}

export default App
