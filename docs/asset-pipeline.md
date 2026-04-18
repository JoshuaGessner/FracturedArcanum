# Fractured Arcanum Asset Pipeline

This project uses a commercial-safe, fully local SVG generation pipeline for both brand art and the Phase 3 UI skinning system.

## Current verified output

After the latest regeneration pass, the pipeline produces:

- 168 generated assets total
- 72 UI assets under [public/generated/ui](public/generated/ui)
- 90 card illustrations under [public/generated/cards](public/generated/cards)
- 6 root brand and shared art files at the public root
- a manifest at [public/generated/asset-manifest.json](public/generated/asset-manifest.json)

Run the generator with:

- npm run assets:generate

## Asset policy

- original assets only
- commercial-safe output only
- no copyrighted references or derivative branding
- no required attribution for shipped core assets
- player-facing moderation and analytics visuals remain privacy-safe and non-identifying

## Asset categories

The generator now covers all major release surfaces:

- screen backgrounds
- navigation tile art
- rank insignia
- pack covers
- rarity gems
- UI chrome such as panel frames, button frames, dividers, pips, and stat icons
- effect icons for card abilities
- battle and reward overlays
- ambient particle textures
- full card illustration SVGs for the live playable card set

## Semantic registry workflow

UI assets are not referenced ad hoc. The app resolves them through the semantic registry in [src/constants.ts](src/constants.ts) using the exported `UI_ASSETS` object.

This keeps the visual direction replaceable later:

- screens and components ask for asset roles rather than hardcoded filenames
- [src/components/AssetBadge.tsx](src/components/AssetBadge.tsx) provides shared visual primitives for ranks, rarity, effects, packs, and stats
- [src/utils.ts](src/utils.ts) provides safe helper lookup and fallback behavior

If art direction changes later, update the generator output and registry first instead of rewriting each screen.

## Output layout

- [public/generated/cards](public/generated/cards) — generated card art by card id
- [public/generated/ui](public/generated/ui) — backgrounds, tiles, ranks, packs, gems, chrome, effects, overlays, particles, banners
- [public/generated/asset-manifest.json](public/generated/asset-manifest.json) — source-of-truth manifest for shipped generated art

## Release workflow

1. Update or review blueprint data in [scripts/generate-brand-assets.mjs](scripts/generate-brand-assets.mjs).
2. Run the generator.
3. Confirm the manifest count and output paths are current.
4. Verify shared consumers still render correctly:
   - rank badges
   - rarity gems
   - effect icons
   - pack art
   - button and panel chrome
   - screen background overlays
5. Confirm the UI remains readable at mobile width.
6. Keep the manifest committed with the generated outputs.

## Adding new card art

When a new card is introduced:

1. add or update its blueprint in [scripts/generate-brand-assets.mjs](scripts/generate-brand-assets.mjs)
2. regenerate assets
3. verify the new file appears in [public/generated/cards](public/generated/cards)
4. confirm any aliases or fallbacks in [src/constants.ts](src/constants.ts) still map correctly
5. test the card in battle, collection, inspect modal, and pack reveal surfaces

## Replaceability rules

To keep the UI easy to reskin later:

- prefer semantic names such as `rank-gold.svg`, `fx-heal.svg`, and `panel-frame.svg`
- route repeated visuals through shared components instead of per-screen markup
- keep CSS chrome layered over generated SVG frames
- treat the generator and manifest as the single source of truth for shipped art

## Audio strategy

Release audio remains procedural and synthesized in the browser. The current set covers navigation, taps, summons, attacks, bursts, match found, victory, defeat, pack and reward moments without shipping external media files.

## Prompt style guide

When extending the generator or producing replacement art, keep prompts centered on:

- original fantasy rune battler UI
- luminous crystal magic
- clean mobile readability
- dramatic but non-derivative silhouettes
- esports-friendly contrast and icon clarity
