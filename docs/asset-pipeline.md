# Fractured Arcanum Asset Pipeline

This project is configured for a commercial-safe hybrid asset workflow.

## Asset policy

- Original assets first
- Commercial-safe only
- No copyrighted references
- No required attribution for shipped core assets
- Player-facing analytics and moderation visuals must remain privacy-safe and non-identifying

## Built-in asset generation

The local generator now produces:

- logo art
- crest icon
- board background art
- hero portraits
- admin dashboard banners
- full per-card illustration SVGs for the current playable card set
- a generated manifest at [public/generated/asset-manifest.json](public/generated/asset-manifest.json)

Run the generator with:

- npm run assets:generate

Generated card art is written under [public/generated/cards](public/generated/cards).
UI banners are written under [public/generated/ui](public/generated/ui).

## Release workflow

1. Update or review the card blueprint data in the generator script.
2. Run the asset generation command.
3. Review output in the live app and confirm readability on mobile.
4. If any external service is used later, manually review every output before shipping.
5. Keep the asset manifest current so replacements remain organized.

## Optional external enhancement

The pipeline is prepared for optional environment variables:

- ASSET_PROVIDER
- ASSET_API_KEY

The current release uses the safe local SVG path by default. If you later provide an image-model API key, the same pipeline can be upgraded for higher-fidelity concept renders while keeping the local manifest and fallback flow.

## Audio strategy

Version 1 uses procedural audio synthesized in the browser for:

- button taps
- card summons
- attacks
- burst effects
- win and loss jingles

This keeps the release legally clean and lightweight.

## Prompt style guide

Use prompts centered on:

- original fantasy rune battler UI
- luminous crystal magic
- clean mobile readability
- dramatic but non-derivative silhouettes
- esports-friendly contrast and icon clarity
