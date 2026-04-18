import { type AIDifficulty, type DeckConfig, DEFAULT_DECK_CONFIG } from './game'
import type { CardBorderOffer, CosmeticTheme } from './types'

export const DEFAULT_ARENA_PORT = '43173'

export const ARENA_URL: string =
  (import.meta.env.VITE_ARENA_URL as string | undefined) ??
  (typeof window !== 'undefined' && ['5173', '4173'].includes(window.location.port)
    ? `${window.location.protocol}//${window.location.hostname}:${DEFAULT_ARENA_PORT}`
    : typeof window !== 'undefined'
      ? window.location.origin
      : '')

export const DECK_PRESETS: Array<{ name: string; config: DeckConfig }> = [
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

export const THEME_OFFERS: Array<{ id: CosmeticTheme; name: string; cost: number; note: string }> = [
  { id: 'royal', name: 'Royal Arcane', cost: 0, note: 'Default tournament finish.' },
  { id: 'ember', name: 'Ember Court', cost: 120, note: 'Warm volcanic glow and ember trim.' },
  { id: 'moon', name: 'Moonwell Glow', cost: 180, note: 'Cool luminous highlights and moonlight framing.' },
]

export const CARD_BORDER_OFFERS: CardBorderOffer[] = [
  { id: 'default', name: 'Standard Frame', cost: 0,   description: 'The default arcane bezel every player starts with.' },
  { id: 'bronze',  name: 'Bronze Filigree', cost: 90, description: 'Warm bronze trim with hammered edges.' },
  { id: 'frost',   name: 'Frost Shard',     cost: 180, description: 'Cool ice-shard etching with a soft inner glow.' },
  { id: 'solar',   name: 'Solar Ember',     cost: 280, description: 'Living ember frame with a sunlit inner aura.' },
  { id: 'void',    name: 'Voidweave',       cost: 420, description: 'Animated dark-matter weave with a violet halo.' },
]

const toUiAsset = (fileName: string): string => `/generated/ui/${fileName}`

export const UI_ASSETS = {
  backgrounds: {
    home: toUiAsset('bg-main-menu.svg'),
    play: toUiAsset('bg-play.svg'),
    collection: toUiAsset('bg-collection.svg'),
    social: toUiAsset('bg-social.svg'),
    shop: toUiAsset('bg-shop.svg'),
    battle: toUiAsset('bg-battle.svg'),
    settings: toUiAsset('bg-settings.svg'),
  },
  tiles: {
    play: toUiAsset('tile-play.svg'),
    collection: toUiAsset('tile-collection.svg'),
    social: toUiAsset('tile-social.svg'),
    shop: toUiAsset('tile-shop.svg'),
    settings: toUiAsset('tile-settings.svg'),
    battle: toUiAsset('tile-battle.svg'),
  },
  ranks: {
    bronze: toUiAsset('rank-bronze.svg'),
    silver: toUiAsset('rank-silver.svg'),
    gold: toUiAsset('rank-gold.svg'),
    diamond: toUiAsset('rank-diamond.svg'),
  },
  packs: {
    standard: toUiAsset('pack-standard.svg'),
    premium: toUiAsset('pack-premium.svg'),
    legendary: toUiAsset('pack-legendary.svg'),
  },
  rarityGems: {
    common: toUiAsset('gem-common.svg'),
    rare: toUiAsset('gem-rare.svg'),
    epic: toUiAsset('gem-epic.svg'),
    legendary: toUiAsset('gem-legendary.svg'),
  },
  chrome: {
    primaryButton: toUiAsset('btn-primary.svg'),
    ghostButton: toUiAsset('btn-ghost.svg'),
    dangerButton: toUiAsset('btn-danger.svg'),
    panelFrame: toUiAsset('panel-frame.svg'),
    dividerRune: toUiAsset('divider-rune.svg'),
  },
  pips: {
    manaEmpty: toUiAsset('pip-mana-empty.svg'),
    manaFilled: toUiAsset('pip-mana-filled.svg'),
    momentumEmpty: toUiAsset('pip-momentum-empty.svg'),
    momentumFilled: toUiAsset('pip-momentum-filled.svg'),
  },
  stats: {
    attack: toUiAsset('icon-attack.svg'),
    health: toUiAsset('icon-health.svg'),
    guard: toUiAsset('icon-guard.svg'),
  },
  overlays: {
    versus: toUiAsset('overlay-vs.svg'),
    victory: toUiAsset('overlay-victory.svg'),
    defeat: toUiAsset('overlay-defeat.svg'),
    draw: toUiAsset('overlay-draw.svg'),
    attackArrow: toUiAsset('overlay-attack-arrow.svg'),
    heroCracks: toUiAsset('overlay-hero-cracks.svg'),
    heroHalo: toUiAsset('overlay-hero-halo.svg'),
    packBurst: toUiAsset('pack-burst.svg'),
    ribbonNew: toUiAsset('ribbon-new.svg'),
  },
  glows: {
    common: toUiAsset('glow-common.svg'),
    rare: toUiAsset('glow-rare.svg'),
    epic: toUiAsset('glow-epic.svg'),
    legendary: toUiAsset('glow-legendary.svg'),
  },
  particles: {
    rune: toUiAsset('particle-rune.svg'),
    ember: toUiAsset('particle-ember.svg'),
    dust: toUiAsset('particle-dust.svg'),
    frost: toUiAsset('particle-frost.svg'),
  },
  effects: {
    charge: toUiAsset('fx-charge.svg'),
    guard: toUiAsset('fx-guard.svg'),
    rally: toUiAsset('fx-rally.svg'),
    blast: toUiAsset('fx-blast.svg'),
    heal: toUiAsset('fx-heal.svg'),
    draw: toUiAsset('fx-draw.svg'),
    fury: toUiAsset('fx-fury.svg'),
    drain: toUiAsset('fx-drain.svg'),
    empower: toUiAsset('fx-empower.svg'),
    poison: toUiAsset('fx-poison.svg'),
    shield: toUiAsset('fx-shield.svg'),
    siphon: toUiAsset('fx-siphon.svg'),
    bolster: toUiAsset('fx-bolster.svg'),
    cleave: toUiAsset('fx-cleave.svg'),
    lifesteal: toUiAsset('fx-lifesteal.svg'),
    summon: toUiAsset('fx-summon.svg'),
    silence: toUiAsset('fx-silence.svg'),
    frostbite: toUiAsset('fx-frostbite.svg'),
    enrage: toUiAsset('fx-enrage.svg'),
    deathrattle: toUiAsset('fx-deathrattle.svg'),
  },
} as const

export const NAV_TILE_ART = UI_ASSETS.tiles
export const RANK_INSIGNIA = UI_ASSETS.ranks
export const PACK_ART = UI_ASSETS.packs
export const RARITY_GEM_ICONS = UI_ASSETS.rarityGems
export const EFFECT_ICONS = UI_ASSETS.effects

export const STORAGE_KEYS = {
  deck: 'fractured-arcanum.deck',
  sound: 'fractured-arcanum.sound',
  rating: 'fractured-arcanum.rating',
  record: 'fractured-arcanum.record',
  mode: 'fractured-arcanum.mode',
  aiDifficulty: 'fractured-arcanum.ai-difficulty',
  visitor: 'fractured-arcanum.visitor',
  analyticsConsent: 'fractured-arcanum.analytics-consent',
  runes: 'fractured-arcanum.shards',
  ownedThemes: 'fractured-arcanum.owned-themes',
  selectedTheme: 'fractured-arcanum.selected-theme',
  lastDailyClaim: 'fractured-arcanum.last-daily-claim',
  authToken: 'fractured-arcanum.auth-token',
}

export const DECK_MAX_TOTAL_DISPLAY = 16

export const AI_DIFFICULTY_OPTIONS: Array<{ id: 'auto' | AIDifficulty; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'novice', label: 'Novice' },
  { id: 'adept', label: 'Adept' },
  { id: 'veteran', label: 'Veteran' },
  { id: 'legend', label: 'Legend' },
]

export const CARD_ART_ALIASES: Record<string, string> = {
  'cave-bat': 'plague-rat',
  'copper-automaton': 'clay-soldier',
  'bog-lurker': 'swamp-lurker',
  'militia-recruit': 'war-grunt',
  'rust-golem': 'stone-golem',
  'thornback-boar': 'wild-boar',
  'granite-sentinel': 'stone-wall',
  'field-medic': 'spirit-healer',
  'sand-elemental': 'dust-devil',
  'pack-wolf': 'thunder-wolf',
  'clockwork-knight': 'iron-sentry',
  'siege-turtle': 'moss-troll',
  'flame-juggler': 'flame-dancer',
  'highland-archer': 'elven-archer',
  'moss-treant': 'thorn-bush',
  'coral-guardian': 'coral-golem',
  'frost-weaver': 'frost-archer',
  'crimson-berserker': 'bone-knight',
  'war-mammoth': 'sunforged-giant',
  'thunder-hawk': 'tempest-eagle',
  'hex-spider': 'shadow-fiend',
  'shadow-dancer': 'shadow-fiend',
  'vine-lasher': 'nature-sprite',
  'bronze-drake': 'fire-drake',
  'blood-queen': 'crimson-witch',
  'iron-juggernaut': 'iron-sentry',
  'void-empress': 'void-stalker',
  'storm-titan': 'thunder-titan',
  'drakarion-the-eternal': 'drakarion',
  'zephyr-world-breaker': 'zephyr',
  'velara-the-lifebinder': 'velara',
  'malachar-the-undying': 'malachar',
  'kronos-the-forgemaster': 'kronos',
  'aethon-runekeeper': 'aethon',
}

export const EFFECT_LABELS: Record<string, string> = {
  charge: 'Charge',
  guard: 'Guard',
  rally: 'Rally',
  blast: 'Blast',
  heal: 'Heal',
  draw: 'Draw',
  fury: 'Fury',
  drain: 'Drain',
  empower: 'Empower',
  poison: 'Poison',
  shield: 'Shield',
  siphon: 'Siphon',
  bolster: 'Bolster',
  cleave: 'Cleave',
  lifesteal: 'Lifesteal',
  summon: 'Summon',
  silence: 'Silence',
  frostbite: 'Frostbite',
  enrage: 'Enrage',
  deathrattle: 'Deathrattle',
  overwhelm: 'Overwhelm',
}

export const EFFECT_DESCRIPTIONS: Record<string, string> = {
  charge: 'Can attack immediately when played — does not wait a turn.',
  guard: 'Enemies must attack this unit before they can target your hero or other units.',
  rally: 'Grants +1 Momentum when played (some cards grant more).',
  blast: 'Deals 2 damage to the enemy hero when played (some cards deal more or less).',
  heal: 'Restores 2 health to your hero when played (some cards heal more).',
  draw: 'Draw an extra card when played.',
  fury: 'Gains +1 attack after surviving combat.',
  drain: 'Steals enemy Momentum when played.',
  empower: 'Gives all friendly units +1 attack when played (some cards grant more).',
  poison: 'Deals damage to all enemy units when played.',
  shield: 'Grants bonus armor (extra hero health) when played.',
  siphon: 'Damages the enemy hero and heals your hero for the same amount.',
  bolster: 'Boosts friendly health when played (usually +1, with stronger card-specific variants).',
  cleave: 'Attacks all enemy lanes at once instead of just one.',
  lifesteal: 'Heals your hero for the amount of damage dealt.',
  summon: 'Creates a 1/1 token unit in an empty lane when played.',
  silence: 'Removes effects from all enemy units when played.',
  frostbite: 'Exhausts a random enemy unit when played; stronger cards can freeze all enemies.',
  enrage: 'Gains +2 attack when damaged.',
  deathrattle: 'Triggers a special effect when this unit is destroyed.',
  overwhelm: 'Excess damage to a unit carries over to the enemy hero.',
}
