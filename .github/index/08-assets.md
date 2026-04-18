# Generated Asset Pipeline (Phase 3A)

All bundled images are produced by `scripts/generate-brand-assets.mjs` (996 lines) and written into `public/generated/`. There are **168 generated assets** total — 100 brand/card and 68 UI assets — registered in `public/generated/asset-manifest.json`.

## Generation

| Command | Effect |
|---------|--------|
| `npm run assets:generate` | Re-runs the generator script |
| `node scripts/generate-brand-assets.mjs` | Same, direct |

The generator never overwrites manually edited art that lives outside `public/generated/`. All output is plain SVG, original, commercial-safe.

## Output Layout

```
public/
├── fractured-arcanum-logo.svg           Brand wordmark
├── fractured-arcanum-crest.svg          Brand crest
├── fractured-arcanum-board.svg          Brand board art
├── fractured-arcanum-card.svg           Brand card frame
├── fractured-arcanum-hero-player.svg
├── fractured-arcanum-hero-enemy.svg
└── generated/
    ├── asset-manifest.json
    ├── cards/                            Card art (one SVG per card id)
    └── ui/                               68 UI assets (Phase 3A)
```

## UI Asset Inventory (`public/generated/ui/`)

| Group | Count | Files | Viewbox | Used By |
|-------|-------|-------|---------|---------|
| Backgrounds | 7 | `bg-{main-menu,play,collection,social,shop,battle,settings}.svg` | 1440×900 | Per-screen `::before` ambient backdrops in App.css |
| Nav tiles | 6 | `tile-{play,collection,social,shop,settings,battle}.svg` | 240×320 | HomeScreen `.nav-tile-${id}::before` |
| Rank insignia | 4 | `rank-{bronze,silver,gold,diamond}.svg` | 120×120 | (Reserved — wire into rank badge) |
| Pack covers | 3 | `pack-{standard,premium,legendary}.svg` | 200×280 | (Reserved — wire into ShopScreen) |
| Rarity gems | 4 | `gem-{common,rare,epic,legendary}.svg` | 32×32 | (Reserved — card chip) |
| UI chrome | 12 | `btn-{primary,ghost,danger}.svg`, `panel-frame.svg`, `divider-rune.svg`, `pip-mana-{empty,filled}.svg`, `pip-momentum-{empty,filled}.svg`, `icon-{health,attack,guard}.svg` | varies | (Reserved — chrome polish phase) |
| Effect icons | 20 | `fx-{charge,guard,rally,blast,heal,draw,fury,drain,empower,poison,shield,siphon,bolster,cleave,lifesteal,summon,silence,frostbite,enrage,deathrattle}.svg` | 40×40 | (Reserved — wire into card-effect chips) |
| Overlays | 8 | `overlay-{vs,victory,defeat,draw}.svg`, `glow-{common,rare,epic,legendary}.svg` | varies | (Reserved — battle splash + pack-open ceremony) |
| Particles | 4 | `particle-{rune,ember,dust,frost}.svg` | 16×16 | (Reserved — animated FX layer) |
| Banners | 4 | `admin-ops-banner.svg`, `asset-forge-banner.svg`, `season-medal.svg`, `reward-chest.svg` | varies | Pre-existing UI banners |

## Manifest Format (`asset-manifest.json`)

Each entry:

```json
{
  "id": "bg-main-menu.svg",
  "path": "/generated/ui/bg-main-menu.svg",
  "type": "ui-background",
  "source": "local-generated"
}
```

`type` is one of: `brand`, `ui-banner`, `ui-background`, `ui-nav-tile`, `ui-rank`, `ui-pack`, `ui-rarity-gem`, `ui-chrome`, `ui-effect`, `ui-overlay`, `ui-particle`, `card-art`. Card-art entries also carry a `rarity` field.

## Editing the Generator

`scripts/generate-brand-assets.mjs` structure:

1. Output directory setup (top of file)
2. Palette + provider config
3. `cardBlueprints` array — primary card art definitions
4. `extendedBlueprints` array — secondary card art
5. `makeCardArt(card)` — SVG card builder
6. `sharedFiles` object — brand SVGs at the public root
7. **Phase 3A block** — `svg()` helper, `bg()`, `tileBg()`, `rankShield()`, `pack()`, `gem()`, `fx()` template helpers; then `backgrounds`, `tiles`, `ranks`, `packs`, `gems`, `chrome`, `effects`, `overlays`, `particles` objects merged into `uiAssets`
8. `uiAssetType(id)` classifier for manifest tagging
9. Manifest construction with `sharedFiles + uiAssets + allCards`
10. Three writer loops (sharedFiles, uiAssets, cards), then manifest write

To add a new UI asset: append to the appropriate object inside the Phase 3A block, run `npm run assets:generate`, commit both the new SVG and the regenerated manifest.

## CSS Wiring Conventions

- Per-screen ambient backdrop: scoped to `.{screen-name}.active::before` (not generic `.screen-panel.active::before` — would over-apply to BattleScreen subpanels)
- Default backdrop opacity: `0.22` (battle uses `0.32`)
- `prefers-reduced-motion` drops the `saturate+blur` filter
- Unique screen classes: `.home-screen`, `.play-screen`, `.collection-screen`, `.social-screen`, `.shop-screen`, `.settings-screen`, `.battlefield`
- Nav tile illustrations: `.nav-tile-{id}::before` at `opacity: 0.18` (hover boosts to `0.32`)
