# UI Design Principles

How Fractured Arcanum's interface is meant to look and behave, and why. Each
rule comes from studying how the established mobile card games solved the
same problem — Hearthstone, Marvel Snap, Legends of Runeterra, Clash Royale,
Gwent, Slay the Spire, Pokémon TCG Live — and is written down so a later
change does not quietly undo it.

Read this before visual or UX work. `.github/REFACTOR_PLAN.md` covers the
scene-first layout direction; this covers the rules the screens follow.

---

## 1. The cards are the hierarchy

> "The cards should always take precedent in the visual hierarchy, and the UI
> should always serve the purpose of highlighting the cards whenever possible."
> — Marvel Snap's UI direction

- **One card face.** `src/components/CardFace.tsx` draws every card in hand, on
  the board, in the collection, in inspect and in pack reveals. A card reads
  identically everywhere; never build a second face.
- **Every illustration is lit for card size.** `scripts/lib/card-art.mjs`
  wraps each subject in a rim-light filter (a lit top edge, a thin all-round
  rim and a soft halo), sets a backlight behind it, and adds light shafts and
  motes; the vignette stops at 0.4. A rim only reads against a dark ground, so
  the backgrounds stay dark and the subject is the brightest thing in the
  frame — one focal subject, separated by value, as character-art readability
  guides teach. CSS adds only a light lift (brightness, contrast, a candle key
  light).
- **The bezel is a material, not a colour.** Aged bronze for every card, gold
  for legendaries. Rarity rides the gem and the hairline inside the bezel —
  Hearthstone's approach — so a full-strength rarity border never turns a
  common into grey plastic.
- **The board's containers recede.** Lanes are shallow seats in the table, not
  boxes; units fill them. If a frame is more visible than the card in it, the
  frame is wrong.

## 2. Numbers read at a glance, under a thumb

- **Corner layout:** cost top-left, keyword seal top-right, attack bottom-left,
  health bottom-right — Hearthstone's vocabulary, which players arrive with.
- **The stats are emblems, not dots.** `scripts/lib/stat-art.mjs` draws them
  as objects lit from the upper left and ringed in cast gold: a faceted cyan
  **mana crystal**, **crossed swords** behind an amber boss for attack, and a
  **blood drop** for health. The three differ in silhouette, so they read
  without colour. Each emblem leaves a calm, darker field where its number
  sits.
- **Changed stats change colour, the genre's way.** Health below its maximum
  reads red; attack or health above the printed value reads green
  (`CardFace`'s `base` prop, fed by `getPrintedStats`). White is always the
  printed number. The hero's health uses the same blood drop.
- **Numerals are tabular with a cut outline** (`-webkit-text-stroke` with
  `paint-order`), so they survive any gem colour and never jitter as they
  change.
- **A value never sits on art without a plate.** Every number lives on its own
  gem; nothing is printed straight onto an illustration.
- **Floating numbers on every hit and heal.** `useHealthPops` diffs health by
  hero and unit uid and floats `-3` / `+2` over the thing that changed — the
  readout every game in the genre puts on the unit itself.

## 3. One signal per meaning, used everywhere

| Meaning | Signal |
|---|---|
| Can act now (affordable card, ready unit) | steady verdigris edge |
| Spent / cannot act (your side) | dimmed and desaturated, never translucent |
| Turn is spent, press End Turn | End Turn glows |
| Burst is affordable | the Burst medallion lights |
| Strike target while attacking | blood edge pulsing on the enemy plaque |

The verdigris edge means the same thing on a hand card and a board unit. Do
not add a second colour for "playable" anywhere. The opponent's units are
never dimmed on your turn: their readiness is irrelevant to you, and a dimmed
enemy row makes the whole board look switched off.

## 4. Controls go where thumbs are — and dangerous ones don't

- **The primary action is the largest, lowest thing on the screen.** Battle on
  Home, End Turn in a match (Clash Royale's big Battle button, Snap's Play).
- **Leave sits at the far end of the screen from End Turn.** Case studies of
  Snap single out its retreat and end-turn buttons for accidental presses;
  ours keeps Leave in the enemy row at the top. It pauses rather than forfeits.
- **Resources sit with what spends them.** Momentum lives on the Burst
  medallion (a charge ring with a notch at its cost — Hearthstone's hero
  power, Runeterra's attack token), mana sits on the player's plaque beside
  health with a large count.
- **Touch the hero to hit the hero.** While an attacker is selected, the whole
  enemy plaque is the strike target.
- Touch targets stay at 44px or more.

## 5. Information the opponent's side owes you

The enemy plaque shows cards in hand and cards in deck. Every competitive card
game surfaces both; without them a player cannot reason about what is coming.
`getPileCounts` reads them from the local engine or the server's redacted view.

## 6. Navigation stays shallow and visible

- Four bottom destinations; the active tab is a lit brass socket, not a
  colour change alone.
- Section tabs (Shop, Social, Settings) ride **one row** on a phone and scroll
  with a fade if they must. Wrapped into a grid they read as a menu and cost a
  row of height on every visit.
- Depth is one level (Clash Royale's rule): hub, then subview with Back.
- **The deck you are about to play sits beside the button that plays it.**
  Snap moved its deck carousel onto the main screen for exactly this; Home's
  `HomeDeckShowcase` shows the active deck and steps through saved decks.

## 7. Ceremony is earned, and it fills the screen

- The versus beat is full-screen: two seats sweeping in from either side in
  their own colours, the seal slamming between them.
- Results use the shared `SummaryPopup` with a **result crest** (laurel,
  broken sword, scales) and the reward on a ribbon. Reuse it; do not build a
  second recap.
- Juice serves readability first: anticipation and impact (slam, shake,
  floating numbers) tell the player what happened. Every animation has a
  `prefers-reduced-motion` fallback that still communicates the outcome.

## 8. Materials, palette, type

- Materials are physical (Hearthstone's "flavour over efficiency"): bronze,
  brass, lacquer, candlelight on wood. One material system, used consistently
  — Runeterra reserves its gold for high-impact actions, and so do we: the
  gilded `.primary` is for the one main action on a surface.
- Colours come only from the palette tokens in `src/styles/tokens.css` (umber,
  bone, brass, ember, verdigris, violet, blood).
- Display face (Cinzel) for names, titles, numbers on gems and primary
  buttons; body face (Inter) for anything read at length.
- No emoji, no text inside SVGs that depends on an installed font.
- **Buttons are objects you press.** `.primary` and `.secondary` sit on a
  solid ledge (`--btn-ledge-depth`, `--btn-primary-ledge`,
  `--btn-secondary-ledge`); on press the face drops onto it in 60ms and the
  ledge collapses to a sliver, the tactile press of Clash Royale's buttons.
  The quiet `.ghost` tier has no ledge. Reduced motion keeps the shadow change
  and drops the movement.

## 8a. Earnables are materials you can see

What the shop sells must be visible on the thing it decorates, at the size
the player sees it.

- **Frames are art, not border colours.** `scripts/lib/frame-art.mjs` draws
  each paid frame as a cast material over the whole card: bezel band, corner
  caps, a crest at top centre and clasps at the art/plate seam. Ornament stays
  off the corners, which belong to the stat emblems.
- **The ladder climbs in structure**, the way Hearthstone's golden frames and
  Marvel Snap's border ladder do: Bronze is beaded metal, Frost adds etched
  crystal, Solar adds rising embers and a breathing light, Void adds rune cuts
  and a travelling sheen. Only the top two move, and both stop under reduced
  motion. The default frame stays plain — it is the baseline.
- **Rarity is never for sale.** The gem and the hairline inside the bezel sit
  above any frame (`.cf-gems`, z 5), so no frame can make a common read as an
  epic. See "The two frame channels" in `src/styles/cards.css`.
- **Previews are the real thing.** The shop shows each frame on a real
  `CardFace` (`FRAME_SHOWCASE_CARD_ID`), and each theme swatch is the
  main-menu scene under that theme's own two lights — the same
  `--theme-light-a` / `--theme-light-b` channels the shell uses, so a preview
  can never drift from what the purchase does.

## 9. Settings look like settings

Binary preferences use `SettingSwitch` — `role="switch"` with `aria-checked`,
named by the setting — inside one grouped list with hairline dividers. A
button whose label flips between "On" and "Off" leaves a screen reader
guessing which one is the current state.

---

## Sources

- [SNAPPY U.I. — How Marvel Snap's user interface supports its success (Andrew Hutcheson)](https://www.artstation.com/artwork/GemNDd)
- [Marvel's Snap — UI/UX case study](https://medium.com/design-bootcamp/marvels-snap-ui-ux-case-study-9f727d8f3875)
- [Hearthstone: How to create an immersive user interface (Derek Sakamoto, GDC 2015)](https://gdcvault.com/play/1022036/Hearthstone-How-to-Create-an)
- [Video: designing an immersive user interface for Hearthstone (Game Developer)](https://www.gamedeveloper.com/design/video-designing-an-immersive-user-interface-for-i-hearthstone-i-)
- [Legends of Runeterra visual identity (Behance)](https://www.behance.net/gallery/125951493/Legends-of-Runeterra-Visual-Identity?locale=en_US)
- [Game design UX best practices — breakdown of Clash Royale (The Rookies)](https://www.therookies.co/blog/education/game-design-ux-best-practices-detailed-breakdown-of-clash-royale)
- [Card UI readability vs aesthetics (SEYIL Studios)](https://seyilstudios.com/en/blog/card-ui-readability-vs-aesthetics)
- [4 layout tips for designing card games](https://medium.com/@dylanmangini/4-layout-tips-for-designing-card-games-17cc98b89b96)
- [Mobile game UI design: thumbs, sessions and constraints (Wandr)](https://www.wandr.studio/blog/mobile-game-ui-design)
- [Marvel Snap: deck selection carousel on the main screen (patch notes)](https://marvelsnap.com/patch-notes-january-6-2026/)
- [Typography for game UI: the part players read under pressure](https://h-idris.com/blog/game-ui-typography.html)
- [Disney's 12 animation principles applied to games](https://gamejuice.co.uk/articles/disney-12-animation-principles-games)
- [Minion: attack on a yellow sword, health on a red blood drop (Hearthstone Wiki)](https://hearthstone.fandom.com/wiki/Minion)
- [Health: damaged health shows red (Hearthstone Wiki)](https://hearthstone.fandom.com/wiki/Health)
- [In-depth guide: health and attack colours, buffs in green (HearthPwn)](https://www.hearthpwn.com/forums/hearthstone-general/general-discussion/19517-in-depth-guide-health-and-attack-in-hearthstone)
- [Golden card: a premium frame and animation, no gameplay difference (Hearthstone Wiki)](https://hearthstone.fandom.com/wiki/Golden_card)
- [Marvel Snap card rarity: the border ladder from plain to animated (Marvel Snap Zone)](https://marvelsnapzone.com/marvel-snap-card-rarity-guide/)
- [Custom borders in Marvel Snap (SNAP.FAN)](https://snap.fan/news/custom-borders-in-marvel-snap/)
- [Character design: shape language and readability](https://medium.com/@EightyLevel/character-design-shape-language-and-readability-6ee4bb6f98a6)
- [How a character reveal card is built: backlit rim light](https://blog.pixai.art/en/how-to-make-character-reveal-art/)
- [Building a 3D button with HTML and CSS (Josh W. Comeau)](https://www.joshwcomeau.com/animation/3d-button/)
