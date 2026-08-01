# Layout QA

Four tools cover UI layout. They differ in cost and in the kind of question they
can answer, so reach for the cheapest one that settles the question in front of
you.

| Tool | Question it answers | Cost |
|------|--------------------|------|
| `npm run qa:probe` | "Does this specific layout invariant still hold, and which CSS rule broke it?" | ~1s per state |
| `npm run qa:snap` / `qa:snap:check` | "Did this restyle change anything I didn't intend?" | ~5s per state |
| `npm run qa:tokens` | "Where has the UI drifted off the design tokens?" | milliseconds |
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

## qa:tokens — design-system drift

```bash
npm run qa:tokens              # summary, worst offenders first
npm run qa:tokens -- --list    # every occurrence with file:line
npm run qa:tokens -- --fixable # only the unambiguous 1:1 substitutions
npm run qa:tokens -- --write   # apply those substitutions
```

Static parse of `src/styles/*.css`, no browser. Finds literal values that have
an exact token equivalent — a hardcoded `12px` where `var(--space-3)` means the
same thing.

Correctness comes from what it refuses to flag: declarations inside `:root`
(where tokens are defined), values already inside a `var()`, `@keyframes` bodies
(animation waypoints, not layout), `0` and `1px` (hairlines and resets), and
properties outside a token family's scale — `4px` as a `border-radius` is not
`--space-1`, since spacing and radii are different scales that share numbers.

`--write` only rewrites declarations whose *entire* value is a single matching
literal, so each substitution is behaviour-preserving by construction. Compound
values like `8px 16px` are always left for a human: whether a whole shorthand
was reaching for the scale is a judgement call. The first run applied 240
substitutions across 17 files and `qa:snap:check` reported 48/48 states
unchanged.

## qa:viewport — the pre-release sweep

```bash
npm run qa:viewport                              # whole device matrix
npm run qa:viewport -- --vp=iphone-15-393x852    # one device, both chrome states
npm run qa:viewport -- --route=shop,social       # one or more routes
npm run qa:viewport -- --full                    # every result in the JSON
```

The widest and slowest tool: every device at both browser-chrome heights, every
subview, a screenshot each, plus a component-scaling sweep that catches a label
growing while its container shrinks. Run it before a release, not in a loop —
`qa:probe` answers the same layout questions in about a second per state.

`--vp` matches a device name with or without the `-toolbar` / `-fullscreen`
suffix, so naming the device selects both of its chrome states.

Two things about this script are worth knowing:

- **The JSON report is failures-only by default.** It used to inline all ~284
  states with every measured rect, which made it too large to read — so nobody
  read it. `--full` restores the complete record.
- **Server boot and authentication come from `scripts/lib/qa-app.mjs`**, shared
  with the probe. They were a second inline copy until recently, which is how
  this script came to still reference a `qa_tester` account that does not
  exist — every run would have failed at sign-in. Two copies of an auth flow
  drift, and the drift is silent until the day you need the tool.

## What the sweep does and does not call a failure

`qa:viewport`'s clipped-text check ignores truncation the CSS asked for.
`-webkit-line-clamp: N` is implemented as `overflow: hidden` plus content
taller than the box, so a naive "scrollHeight > clientHeight" test flags every
clamped element that actually wraps — permanently, and wrongly. Same for
`text-overflow: ellipsis` horizontally.

The exclusions are per-axis, because each mechanism only handles one direction.
A line-clamped element overflowing *horizontally* is still a real bug, and an
ellipsised one overflowing *vertically* is too.

This matters more than it sounds: before the fix, `.card-name` in battle
accounted for a standing set of failures that were the clamp working correctly.
A check that cries wolf gets ignored, and the genuine clipping sitting next to
it gets ignored with it.

## Shared definitions

`scripts/lib/appStates.mjs` holds the viewports, the states, and the navigation
to reach them. Both browser-driven tools import it, so a new screen is added once
and both pick it up. It also carries the navigation details that were expensive to learn:

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
- Cleanup is limited to sessions the harness itself created, identified by a
  marker user-agent hash, and only once they are over an hour old. Hand-made
  browser sessions are never touched, and a concurrent run cannot delete a live
  session out from under another process — without that guard two overlapping
  runs log each other out mid-run and both wedge. (Waiting for the full 7-day
  expiry instead let ~90 rows pile up over one afternoon of iteration.)

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
