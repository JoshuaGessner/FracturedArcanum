# Generated Asset Pipeline

All shipped visual art is produced by [scripts/generate-brand-assets.mjs](../../scripts/generate-brand-assets.mjs) and written into [public/generated](../../public/generated). The generator is deterministic — scattered marks come from seeded generators — so regenerating with no source change produces no diff beyond the manifest timestamp. The latest pass produced **201 manifest entries**.

The art direction is the card art's own light: warm umber dark, candlelight, brass engraving, one tint per meaning. No asset carries a baked backdrop that a screen already provides, and no shipped UI uses an emoji (`server/no-emoji.test.js`).

## Source modules

| Module | Produces |
|--------|----------|
| [scripts/lib/card-art.mjs](../../scripts/lib/card-art.mjs) | One bespoke scene per card, the four battle tokens, and the `card-unknown` load-error seal. The card list is imported from the compiled engine (`server/game.js`), so a card without a scene fails the run; art for retired ids is pruned. |
| [scripts/lib/glyph-art.mjs](../../scripts/lib/glyph-art.mjs) | One-ink 24×24 line glyphs painted through a CSS mask: the ten tribe sigils (`tribe-*`) and the interface marks (`glyph-*`: close, back, chevrons, crests, quest kinds, contract, edit, delete, theme, frame, lantern, card). |
| [scripts/lib/insignia-art.mjs](../../scripts/lib/insignia-art.mjs) | Keyword seals (`fx-*`, one tint per effect family), league shields (`rank-*`), the currency `shard.svg`, the versus seal, the victory/defeat/draw crests, and the NEW ribbon. |
| [scripts/lib/scene-art.mjs](../../scripts/lib/scene-art.mjs) | The battle table (`bg-battle.svg`), the empty-lane `lane-sigil.svg`, and the candle-lit menu rooms (`bg-main-menu`, `bg-collection`, `bg-shop`, `bg-social`, `bg-settings`, `bg-play`). |
| [scripts/lib/relic-art.mjs](../../scripts/lib/relic-art.mjs) | The three packs (bound folio, violet grimoire, gilded reliquary) and `card-back.svg`. |
| `generate-brand-assets.mjs` itself | Brand marks, nav glyphs, rarity gems, chrome, glows, particles, the remaining overlays, and the manifest. |

## Verified asset counts

| Category | Count |
|---------|------:|
| Root brand and banner art | 10 |
| UI assets | 116 |
| Card art files | 75 |
| Manifest entries | 201 |

## Regeneration

| Command | Purpose |
|---------|---------|
| `npm run assets:generate` | Standard path: rebuilds the engine, then generates |
| `node scripts/generate-brand-assets.mjs` | Direct invocation when `server/game.js` is current |

## Naming conventions

| Prefix | Meaning | Examples |
|------|------|------|
| `bg-` | full-screen scenes | `bg-battle.svg`, `bg-shop.svg` |
| `tribe-` | tribe sigils (mask glyphs) | `tribe-undead.svg` |
| `glyph-` | interface marks (mask glyphs) | `glyph-close.svg`, `glyph-quest-pack.svg` |
| `fx-` | keyword seals | `fx-charge.svg`, `fx-overwhelm.svg` |
| `rank-` | league shields | `rank-gold.svg` |
| `pack-` | pack relics and the ceremony burst | `pack-legendary.svg`, `pack-burst.svg` |
| `gem-` | rarity gems, tinted to `RARITY_COLORS` | `gem-epic.svg` |
| `overlay-` | versus seal, result crests, battle overlays | `overlay-vs.svg`, `overlay-victory.svg` |
| `nav-` | bottom-nav line glyphs (`currentColor`) | `nav-shop.svg` |
| `tile-`, `btn-`, `pip-`, `icon-` | legacy chrome still registered | `tile-play.svg` |
| `glow-`, `particle-` | rarity glows, ambient textures | `glow-legendary.svg` |

Singletons: `shard.svg` (currency), `card-back.svg`, `lane-sigil.svg`, `ribbon-new.svg`.

## How the app consumes assets

- [src/constants.ts](../../src/constants.ts) exports the semantic `UI_ASSETS` registry (`effects`, `tribes`, `glyphs`, `shard`, `cardBack`, `board`, …) plus `EFFECT_ICONS`, `TRIBE_SIGILS` and `INTERFACE_GLYPHS`.
- [src/components/AssetBadge.tsx](../../src/components/AssetBadge.tsx) renders `EffectBadge`, `RarityBadge`, `RankBadge`, `PackArt`, and the mask glyphs `Glyph`, `InterfaceGlyph` and `TribeSigil`.
- [src/components/CardFace.tsx](../../src/components/CardFace.tsx) draws every card face from card art, gems and seals.
- Stylesheets in `src/styles/` reference scenes and glyph masks by path.

`server/ui-assets.test.js` fails if any path in `UI_ASSETS` is missing from `public/` or any keyword lacks a seal — a missing file is a broken image at runtime, not a build error.

## Mask glyphs

`tribe-*` and `glyph-*` files are drawn in pure black on transparent and rendered through `mask: var(--glyph-src)` with `background-color: currentColor`, so one file serves every tint. Do not add colour to them; tint with CSS.

## Extending the generator

1. Add the drawing to the module that owns its family (above), not to the top-level generator.
2. Run `node scripts/generate-brand-assets.mjs`.
3. Register it in `UI_ASSETS` and consume it through the registry or a shared primitive, never a raw path in screen code.
4. `npm test` — the asset test confirms it exists on disk.

## Practical rules

- keep all generated art original and commercially safe
- do not hand-edit files under [public/generated](../../public/generated); the next regeneration replaces them
- no emoji, and no text inside SVGs that depends on an installed font — cut letters as strokes (see `ribbon-new.svg`, `overlay-vs.svg`)
