# Generated Asset Pipeline

All shipped visual art is produced by [scripts/generate-brand-assets.mjs](../../scripts/generate-brand-assets.mjs) and written into [public/generated](../../public/generated). The latest verified generation pass produced **173 manifest entries**.

## Verified asset counts

| Category | Count |
|---------|------:|
| Root brand and shared art | 6 |
| UI assets | 77 |
| Card art files | 90 |
| Manifest entries | 173 |

## Regeneration

| Command | Purpose |
|---------|---------|
| `npm run assets:generate` | Standard regeneration path |
| `node scripts/generate-brand-assets.mjs` | Direct local generator invocation |

## Output structure

- [public/generated/asset-manifest.json](../../public/generated/asset-manifest.json) — generated manifest
- [public/generated/ui](../../public/generated/ui) — all UI chrome and illustrated shell assets
- [public/generated/cards](../../public/generated/cards) — card art by card id

## Naming conventions

| Prefix | Meaning | Examples |
|--------|---------|----------|
| `bg-` | full-screen backdrops | `bg-play.svg`, `bg-settings.svg` |
| `tile-` | home and battle navigation art | `tile-shop.svg`, `tile-battle.svg` |
| `rank-` | rank insignia crests | `rank-gold.svg` |
| `pack-` | pack cover and ceremony burst art | `pack-legendary.svg`, `pack-burst.svg` |
| `gem-` | rarity gem chips | `gem-epic.svg` |
| `btn-` | button frames | `btn-primary.svg`, `btn-danger.svg` |
| `pip-` | mana and momentum pips | `pip-mana-filled.svg` |
| `icon-` | stat and utility icons | `icon-health.svg`, `icon-guard.svg` |
| `fx-` | card effect icons | `fx-charge.svg`, `fx-heal.svg` |
| `overlay-` | cinematic battle and reward art | `overlay-victory.svg`, `overlay-vs.svg` |
| `glow-` | rarity glow bursts | `glow-legendary.svg` |
| `particle-` | ambient effect textures | `particle-rune.svg`, `particle-ember.svg` |
| `ribbon-` | reveal ribbons and badge overlays | `ribbon-new.svg` |

## UI asset groups

| Group | Count | Notes |
|-------|------:|------|
| Backgrounds | 7 | One for each main screen surface |
| Navigation tiles | 6 | Play, collection, social, shop, settings, battle |
| Rank insignia | 4 | Bronze, silver, gold, diamond |
| Pack and ceremony art | 4 | Standard, premium, legendary, burst |
| Rarity gems | 4 | Common through legendary |
| Button frames | 3 | Primary, ghost, danger |
| Mana and momentum pips | 4 | Empty and filled variants |
| Stat icons | 3 | Health, attack, guard |
| Effect icons | 20 | Card-effect icon set |
| Cinematic overlays | 7 | VS, victory, defeat, draw, arrow, hero crack, hero halo |
| Rarity glow bursts | 4 | Common through legendary |
| Particles | 4 | Rune, ember, dust, frost |
| Reveal ribbons | 1 | New-card ribbon |

## How the app consumes assets

- [src/constants.ts](../../src/constants.ts) exports the semantic `UI_ASSETS` registry
- [src/components/AssetBadge.tsx](../../src/components/AssetBadge.tsx) renders shared rank, rarity, effect, pack, and stat visuals
- [src/utils.ts](../../src/utils.ts) supplies safe lookup and fallback helpers
- [src/App.css](../../src/App.css) wires most backgrounds and chrome through semantic class names

## Manifest schema

Each manifest entry records:

- the asset id
- its generated path
- the semantic type such as `ui-background`, `ui-effect`, or `card-art`
- the generation source
- rarity metadata for card art where relevant

## Extending the generator

To add a new asset:

1. update the correct generator block in [scripts/generate-brand-assets.mjs](../../scripts/generate-brand-assets.mjs)
2. regenerate assets
3. verify the new SVG appears in the correct folder and manifest
4. wire it through the semantic registry instead of referencing raw paths directly in screen code

## Practical rules

- keep all generated art original and commercially safe
- do not hand-edit files under [public/generated](../../public/generated) unless you intend the next regeneration to replace them
- treat the generator and manifest as the source of truth for the shipped art direction
