# Layout QA

Three tools cover UI layout. They differ in cost and in the kind of question
they can answer, so reach for the cheapest one that settles the question in
front of you.

| Tool | Question it answers | Cost |
|------|--------------------|------|
| `npm run qa:probe` | "Does this specific layout invariant still hold, and which CSS rule broke it?" | ~1s per state |
| `npm run qa:snap` / `qa:snap:check` | "Did this restyle change anything I didn't intend?" | ~5s per state |
| `npm run qa:viewport` | "Is the full device matrix sound before release?" | minutes |

## qa:probe — the fix/verify loop

```bash
npm run qa:probe                                        # desktop sweep
npm run qa:probe -- --vp=desktop-1440x900 --state=home  # one state
npm run qa:probe -- --only=wheel --state=quests         # one check
npm run qa:probe -- --all-viewports                     # all 56 states
npm run qa:probe -- --full                              # no output budget
npm run qa:probe -- --shots                             # also write PNGs
```

Output is text assertions, not pixels: findings carry the measured numbers and,
on failure, the CSS declaration that produced them plus the resolved value of
any custom property it depends on. In this codebase the rule is often correct
and the *variable* is wrong, so attribution alone would mislead.

```
✗ [centering] .home-final-card declares centring but sits -176px off centre
    leftGap=0 rightGap=176 slack=176 width=980
    ← .home-final-card { justify-self: center }  [@media (min-width: 721px)]
```

The complete record goes to `.layout-qa/probe.json`; the console is capped at 40
lines so a failing sweep stays readable.

### Invariant families

**centering** — landmark centre alignment across `.app-shell`, `.topbar`,
`.scene-stage`, the active panel and `.scene-rail`; plus elements that *declare*
centring intent but sit off-centre. Intent is read from the authored CSS via
CDP, because `getComputedStyle` resolves `margin: auto` to a used pixel value
and so cannot reveal it.

**overlay** — overlays escaping the visible viewport, actions the player cannot
reach, and content clipped inside a non-scrolling overlay. Measured against
`visualViewport`, not the layout viewport.

**wheel** — dispatches a real wheel event through the browser's input pipeline
and asserts `scrollTop` moved. This is the only check that can find a scroll
container which is correct in CSS but unreachable in practice, and it separates
"covered by another element" from "ignores the wheel" because those have
completely different fixes.

## qa:snap — visual baselines

```bash
npm run qa:snap                     # record baselines (desktop)
npm run qa:snap -- --all-viewports  # record every viewport
npm run qa:snap:check               # capture and diff against baselines
```

Record a baseline before starting a restyle, then `--check` after. Output is a
percent-changed figure per state; diff images with changed pixels highlighted
are written to `.layout-qa/diff/` for anything over the threshold.

The threshold is 0.1%, not zero, deliberately: ambient gradients animate on a
12-second loop, quest and currency values reflect live account state, and text
antialiasing varies by a pixel between runs. A zero threshold flags everything
on every run and trains you to ignore the output.

States marked `volatile` in `scripts/lib/appStates.mjs` are excluded from
baselines unless named explicitly. `battle` is volatile — each match deals a
random hand, so the frame differs by ~1.2% between runs with no code change.
It is covered by `qa:probe` instead, which measures geometry rather than colour.

## Shared definitions

`scripts/lib/appStates.mjs` holds the viewports, the states, and the navigation
to reach them. Both tools import it, so a new screen is added once and both pick
it up. It also carries the navigation details that were expensive to learn:

- The shell's `screen-enter-*` class is **not** a transition marker — App.tsx
  only ever reassigns it, never clears it, so waiting for it to disappear waits
  forever.
- "No animation running" is never true; the shell has permanent ambient
  animations. Only a *finite* running animation means a transition is in flight.
- Settle checks must watch `document.getAnimations()`, not the active panel —
  overlays are portalled to `<body>`. Measuring `.sheet-panel` during its
  `translateY(14px) → 0` entry once reported a 13.9px viewport overflow that did
  not exist.
- Navigation targets NavBar's `data-nav` attribute; `getByRole` builds the
  accessibility tree for the whole document on every call.
- A match outlives the tab. "Leave" pauses it; only Home's **Abandon** ends it.
  Automation that starts a match must abandon it or the next run resumes into
  it.

## The QA account

`uxqa`, a real account in the local database with a real password and passkeys,
shared with hand testing. The harness treats it as read-mostly:

- It never calls the login endpoint by default. `accounts` tracks
  `failed_login_count` / `locked_until`, so guessing a password on every run is
  the one thing that could lock it out. A session row is minted directly
  instead. Set `QA_PASSWORD` to opt into the real login path.
- Cleanup is limited to *expired* sessions the harness itself created,
  identified by a marker user-agent hash. Hand-made browser sessions are never
  touched, and a concurrent run cannot delete a live session out from under
  another process.

Point any tool at an already-running app with `QA_URL=http://…` to skip the
boot cost during a tight loop.

## Rule attribution

`scripts/lib/cssAttribution.mjs` turns a CDP `CSS.getMatchedStylesForNode`
payload into "which declaration produced this value". Its behaviour is pinned by
`cssAttribution.test.mjs` against a payload recorded from real Chrome, because
several protocol details are easy to get confidently wrong:

- `matchedCSSRules` is ordered by ascending precedence — **but not when
  `!important` is involved.** In the recorded fixture a rule at index 5 with
  `!important` beats one at index 6; reading the array backwards returns the
  wrong rule.
- Each rule lists authored declarations (which carry a `range`) followed by the
  expanded longhand set (which does not), so shorthands resolve for free.
- Pseudo-element rules (`::before`, `::-webkit-scrollbar`) are in a separate
  bucket and are invisible to a `matchedCSSRules` scan.
- Inline `style=""` outranks every non-important author rule.

Attribution reports the **selector text**, not a file:line. Vite injects CSS as
an inline `<style>` in dev and bundles it in prod, so protocol line numbers map
to neither. Selector text is stable in both and greppable in `src/App.css`.

Regenerate the fixture with:

```bash
node scripts/lib/__fixtures__/record-matched-styles.mjs
```
