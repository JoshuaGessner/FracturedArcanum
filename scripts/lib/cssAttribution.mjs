/**
 * Rule attribution for layout probe findings.
 *
 * Given a `CSS.getMatchedStylesForNode` payload, answer "which CSS declaration
 * actually produced this element's `max-height`?" — so a finding can name a
 * cause instead of just a symptom.
 *
 * ── Why this is not a one-liner ────────────────────────────────────────────
 * A fixture run against Chrome (scripts/tmp-cdp-fixture.mjs, since removed —
 * its findings are locked in by cssAttribution.test.mjs) established four
 * things about the payload that a naive reader gets wrong:
 *
 *   1. `matchedCSSRules` is ordered by ASCENDING precedence — UA rules first,
 *      most specific author rule last. So the winner is near the end.
 *
 *   2. ...but NOT if `!important` is involved. In the fixture, `.shouty`
 *      (index 5, `max-height: 555px !important`) beat `.box .panel`
 *      (index 6, `max-height: calc(...)`). Reading backwards for the first
 *      `max-height` returns index 6 and is confidently WRONG. `!important`
 *      declarations must be resolved as their own higher tier.
 *      This matters for us: App.css has `!important` in the reduced-motion
 *      blocks.
 *
 *   3. Each rule's `cssProperties` contains the AUTHORED declarations (which
 *      carry a `range`) followed by the fully EXPANDED longhand set (which
 *      does not). So `padding: 8px 16px 20px 16px` also appears as four
 *      `padding-*` entries. Detection should read the expanded set — it makes
 *      shorthands work for free — while display should quote the authored one.
 *
 *   4. Inline `style=""` outranks every non-important author rule. In the
 *      fixture an inline `overflow-y: scroll` beat `.panel`'s `auto`.
 *
 * Non-matching `@media` / `@container` rules are already excluded by Chrome,
 * and matching ones report their condition text — both verified.
 */

/** Declarations Chrome synthesises carry no `range`; authored ones do. */
function isAuthored(property) {
  return Boolean(property?.range)
}

/**
 * Chrome reports an important declaration's value with the flag baked in
 * ("555px !important") *and* sets `important: true`. Keep the boolean as the
 * single source of truth so the flag is never rendered twice.
 */
function bareValue(value) {
  return typeof value === 'string' ? value.replace(/\s*!\s*important\s*$/i, '') : value
}

function declarationsFor(style) {
  return Array.isArray(style?.cssProperties) ? style.cssProperties : []
}

/**
 * Find the declaration inside one style block that sets `property`, reading
 * the expanded longhand set so shorthands are matched without a shorthand map.
 * Returns the authored declaration for display where one can be identified.
 */
function findInStyle(style, property) {
  const declarations = declarationsFor(style)
  const effective = declarations.filter((entry) => entry.name === property)
  if (effective.length === 0) return null

  // Last wins within a single block (`max-height: 1px; max-height: 2px`).
  const winner = effective[effective.length - 1]

  // Prefer an authored declaration to quote back. Either the longhand was
  // authored directly, or a shorthand expanded into it.
  const authoredDirect = [...declarations].reverse().find(
    (entry) => entry.name === property && isAuthored(entry),
  )
  const authoredShorthand = [...declarations].reverse().find(
    (entry) => isAuthored(entry)
      && Array.isArray(entry.longhandProperties)
      && entry.longhandProperties.some((longhand) => longhand.name === property),
  )
  const authored = authoredDirect ?? authoredShorthand ?? null

  return {
    value: bareValue(winner.value),
    important: Boolean(winner.important),
    authoredName: authored?.name ?? property,
    authoredValue: bareValue(authored?.value ?? winner.value),
    viaShorthand: Boolean(authored && authored.name !== property),
    range: authored?.range ?? null,
  }
}

/**
 * Every declaration that sets `property`, tagged with its precedence tier and
 * source order. Tier ordering: author-important > inline > author-normal.
 * (UA-origin rules are kept but ranked below author rules of the same tier;
 * they effectively never win a layout property we care about.)
 */
function collectCandidates(matched, property) {
  const candidates = []

  const rules = Array.isArray(matched?.matchedCSSRules) ? matched.matchedCSSRules : []
  rules.forEach((entry, index) => {
    const rule = entry?.rule
    const hit = findInStyle(rule?.style, property)
    if (!hit) return
    candidates.push({
      ...hit,
      order: index,
      origin: rule?.origin ?? 'regular',
      selector: rule?.selectorList?.text ?? '(unknown selector)',
      media: (rule?.media ?? []).map((item) => item.text).filter(Boolean),
      containerQueries: (rule?.containerQueries ?? [])
        .map((item) => item.text ?? item.name)
        .filter(Boolean),
      supports: (rule?.supports ?? []).map((item) => item.text).filter(Boolean),
      source: 'rule',
    })
  })

  const inlineHit = findInStyle(matched?.inlineStyle, property)
  if (inlineHit) {
    candidates.push({
      ...inlineHit,
      // Inline sits above every author rule in its tier, so give it an order
      // beyond any rule index.
      order: rules.length + 1,
      origin: 'inline',
      selector: 'style="" (inline)',
      media: [],
      containerQueries: [],
      supports: [],
      source: 'inline',
    })
  }

  return candidates
}

function tierOf(candidate) {
  if (candidate.important) return 3
  if (candidate.source === 'inline') return 2
  return candidate.origin === 'user-agent' ? 0 : 1
}

/**
 * Resolve which declaration wins for `property`.
 * Returns null when nothing matched the element for that property.
 */
export function attributeProperty(matched, property) {
  const candidates = collectCandidates(matched, property)
  if (candidates.length === 0) return null

  const winner = candidates.reduce((best, candidate) => {
    const tier = tierOf(candidate)
    const bestTier = tierOf(best)
    if (tier !== bestTier) return tier > bestTier ? candidate : best
    return candidate.order >= best.order ? candidate : best
  })

  const overriddenBy = candidates.filter((candidate) => candidate !== winner).length

  return {
    property,
    value: winner.value,
    declaration: `${winner.authoredName}: ${winner.authoredValue}${winner.important ? ' !important' : ''}`,
    selector: winner.selector,
    media: winner.media,
    containerQueries: winner.containerQueries,
    supports: winner.supports,
    viaShorthand: winner.viaShorthand,
    important: winner.important,
    source: winner.source,
    /** How many other declarations for this property lost the cascade. */
    overriddenBy,
  }
}

/** Custom-property names referenced by a declaration value, e.g. --app-h. */
export function customPropertiesIn(value) {
  if (typeof value !== 'string') return []
  const names = new Set()
  const pattern = /var\(\s*(--[\w-]+)/g
  let match = pattern.exec(value)
  while (match) {
    names.add(match[1])
    match = pattern.exec(value)
  }
  return [...names]
}

/** Pseudo-element rules live in their own bucket, keyed by pseudo type. */
export function attributePseudo(matched, pseudoType, property) {
  const bucket = (matched?.pseudoElements ?? []).find((entry) => entry.pseudoType === pseudoType)
  if (!bucket) return null
  return attributeProperty({ matchedCSSRules: bucket.matches ?? [] }, property)
}
