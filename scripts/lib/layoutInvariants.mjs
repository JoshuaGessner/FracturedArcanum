/**
 * In-page layout invariants for the layout probe.
 *
 * `installProbe` is injected with `page.addInitScript`, so it runs before app
 * code on every document and survives navigation. It must be entirely
 * self-contained — Playwright serialises the function source, so it closes over
 * nothing from this module.
 *
 * Everything here only *measures*. Deciding what is a failure, and attributing
 * it to a CSS rule, happens in probe-layout.mjs where the CDP session lives.
 *
 * The wheel check is split across both sides on purpose: the page can find
 * candidates and say what is at a given point, but only the driver can dispatch
 * a trusted wheel event through the browser's real input pipeline. That
 * distinction is the whole reason this check finds bugs that computed style
 * cannot.
 */

export function installProbe() {
  /** Subpixel rounding at fractional DPRs needs a little slack. */
  const TOL = 1

  const round = (value) => Math.round(value * 10) / 10

  const view = () => {
    const vv = window.visualViewport
    return {
      width: Math.round(vv?.width ?? window.innerWidth),
      height: Math.round(vv?.height ?? window.innerHeight),
      offsetTop: Math.round(vv?.offsetTop ?? 0),
      offsetLeft: Math.round(vv?.offsetLeft ?? 0),
      scale: vv?.scale ?? 1,
    }
  }

  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return false
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') return false
    if (Number(style.opacity) === 0) return false
    return true
  }

  /** Short, greppable identity for a node: tag plus its first few classes. */
  const label = (el) => {
    if (!el) return '(nothing)'
    if (el === document.documentElement) return 'html'
    if (el === document.body) return 'body'
    const classes = typeof el.className === 'string' ? el.className.trim() : ''
    const suffix = classes ? `.${classes.split(/\s+/).slice(0, 3).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${suffix}`
  }

  const boxOf = (el) => {
    const rect = el.getBoundingClientRect()
    return {
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
      left: round(rect.left),
      width: round(rect.width),
      height: round(rect.height),
    }
  }

  const clips = (value) => /(hidden|clip|auto|scroll)/.test(value)

  /**
   * The part of an element a user can actually see: its box intersected with
   * every clipping ancestor and with the visual viewport.
   *
   * Approximation, deliberately: a `position: fixed` element is clipped only by
   * the viewport (ancestor overflow cannot touch it unless an ancestor
   * establishes a containing block, which we treat as rare enough to ignore),
   * and an absolutely positioned element is clipped only by positioned
   * ancestors. Static flow content walks the full chain.
   */
  const visibleRect = (el) => {
    const port = view()
    const clip = {
      top: port.offsetTop,
      right: port.offsetLeft + port.width,
      bottom: port.offsetTop + port.height,
      left: port.offsetLeft,
    }
    const own = getComputedStyle(el).position

    if (own !== 'fixed') {
      let current = el.parentElement
      while (current && current !== document.documentElement) {
        const style = getComputedStyle(current)
        const positioned = style.position !== 'static'
        const relevant = own !== 'absolute' || positioned
        if (relevant) {
          if (clips(style.overflowX) || clips(style.overflowY)) {
            const rect = current.getBoundingClientRect()
            if (clips(style.overflowX)) {
              clip.left = Math.max(clip.left, rect.left)
              clip.right = Math.min(clip.right, rect.right)
            }
            if (clips(style.overflowY)) {
              clip.top = Math.max(clip.top, rect.top)
              clip.bottom = Math.min(clip.bottom, rect.bottom)
            }
          }
        }
        if (style.position === 'fixed') break
        current = current.parentElement
      }
    }

    const rect = el.getBoundingClientRect()
    const top = Math.max(rect.top, clip.top)
    const left = Math.max(rect.left, clip.left)
    const bottom = Math.min(rect.bottom, clip.bottom)
    const right = Math.min(rect.right, clip.right)
    return {
      top: round(top),
      left: round(left),
      bottom: round(bottom),
      right: round(right),
      width: round(Math.max(0, right - left)),
      height: round(Math.max(0, bottom - top)),
    }
  }

  /** Inner content box of an element, excluding its own padding and border. */
  const contentBox = (el) => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const num = (value) => Number.parseFloat(value) || 0
    return {
      left: rect.left + num(style.borderLeftWidth) + num(style.paddingLeft),
      right: rect.right - num(style.borderRightWidth) - num(style.paddingRight),
      top: rect.top + num(style.borderTopWidth) + num(style.paddingTop),
      bottom: rect.bottom - num(style.borderBottomWidth) - num(style.paddingBottom),
    }
  }

  let tagCounter = 0
  const tag = (el, attribute) => {
    if (!el.getAttribute(attribute)) {
      tagCounter += 1
      el.setAttribute(attribute, String(tagCounter))
    }
    return el.getAttribute(attribute)
  }

  // ── Landmark alignment ───────────────────────────────────────────────────
  // "The home panel isn't centered like the bottom bar is" is a *relative*
  // complaint, so measure it relatively: the major chrome landmarks must share
  // a horizontal centre line. This needs no knowledge of which one is correct.
  const landmarkAlignment = () => {
    const port = view()
    const wanted = [
      ['app-shell', '.app-shell'],
      ['top-bar', '.topbar'],
      ['scene-stage', '.scene-stage'],
      ['active-panel', '.screen-panel.active'],
      ['nav-rail', '.scene-rail'],
    ]
    const measured = []
    for (const [name, selector] of wanted) {
      const el = document.querySelector(selector)
      if (!el || !isVisible(el)) continue
      const box = boxOf(el)
      measured.push({
        name,
        selector: label(el),
        box,
        center: round((box.left + box.right) / 2),
      })
    }
    const viewportCenter = round(port.offsetLeft + port.width / 2)
    const centers = measured.map((entry) => entry.center)
    const spread = centers.length > 1 ? round(Math.max(...centers) - Math.min(...centers)) : 0
    return {
      viewportCenter,
      spread,
      landmarks: measured.map((entry) => ({
        ...entry,
        offsetFromViewportCenter: round(entry.center - viewportCenter),
      })),
    }
  }

  // ── Per-element symmetry ─────────────────────────────────────────────────
  // Reports asymmetry only. Whether the element *meant* to be centred is
  // decided by the driver from the authored CSS, because `getComputedStyle`
  // resolves `margin: auto` to a used pixel value and so cannot reveal intent.
  const CENTERING_SCOPE = [
    '.app-shell > *',
    '.scene-stage > *',
    '.screen-panel.active > *',
    '.screen-panel.active > * > *',
    '.sheet-panel',
    '.sheet-panel > *',
    '[role="dialog"]',
  ].join(', ')

  const symmetry = () => {
    const seen = new Set()
    const findings = []
    for (const el of document.querySelectorAll(CENTERING_SCOPE)) {
      if (seen.has(el) || !isVisible(el)) continue
      seen.add(el)
      const parent = el.parentElement
      if (!parent) continue

      const box = el.getBoundingClientRect()
      const content = contentBox(parent)
      const available = content.right - content.left
      if (available < 1) continue

      const leftGap = box.left - content.left
      const rightGap = content.right - box.right
      const delta = leftGap - rightGap
      // An element filling its container cannot be off-centre.
      const slack = available - box.width
      if (slack <= TOL) continue
      if (Math.abs(delta) <= TOL) continue

      findings.push({
        id: tag(el, 'data-qa-center-id'),
        selector: label(el),
        parentSelector: label(parent),
        leftGap: round(leftGap),
        rightGap: round(rightGap),
        delta: round(delta),
        slack: round(slack),
        box: boxOf(el),
      })
    }
    return findings
  }

  // ── Overlay containment ──────────────────────────────────────────────────
  // Portalled overlays land on <body>, so scan there rather than inside the
  // shell. An overlay that escapes the visible viewport is the "popup flows
  // out the bottom" class of bug; an overlay whose *actions* escape is the
  // "and can't be used" half, which is the part that actually blocks a player.
  const OVERLAY_SCOPE = [
    '.sheet-panel', '.sheet-scrim',
    '.modal-card', '.modal-scrim', '.modal-shell',
    '.summary-popup', '.card-inspect-modal',
    '[role="dialog"]', '[aria-modal="true"]',
  ].join(', ')

  /**
   * The app shell is itself `position: fixed`, so a naive "fixed element under
   * body" scan classifies the entire application as an overlay. Anything that
   * contains the primary chrome is app frame, not a transient layer.
   */
  const isAppFrame = (el) => el.classList.contains('app-shell')
    || Boolean(el.querySelector('.scene-rail, .screen-panel.active'))

  /**
   * An action scrolled out of view inside a scroll container is reachable — the
   * player scrolls to it. Only actions with no scrollable ancestor between them
   * and the overlay are genuinely stranded.
   */
  const inScrollableAncestor = (action, boundary) => {
    let current = action.parentElement
    while (current) {
      const style = getComputedStyle(current)
      if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 2) return true
      if (/(auto|scroll)/.test(style.overflowX) && current.scrollWidth > current.clientWidth + 2) return true
      if (current === boundary) break
      current = current.parentElement
    }
    return false
  }

  const overlays = () => {
    const candidates = new Set(document.querySelectorAll(OVERLAY_SCOPE))
    // Catch anything portalled and fixed that the selector list does not know.
    for (const el of document.querySelectorAll('body > *, body > * > *')) {
      if (getComputedStyle(el).position === 'fixed') candidates.add(el)
    }
    for (const el of [...candidates]) {
      if (isAppFrame(el)) candidates.delete(el)
    }

    const port = view()
    const visibleTop = port.offsetTop
    const visibleBottom = port.offsetTop + port.height
    const visibleLeft = port.offsetLeft
    const visibleRight = port.offsetLeft + port.width

    const results = []
    for (const el of candidates) {
      if (!isVisible(el)) continue
      const box = boxOf(el)
      const style = getComputedStyle(el)
      const scrollsY = /(auto|scroll)/.test(style.overflowY)
      const contentOverflows = el.scrollHeight > el.clientHeight + 2

      const overflow = {
        bottom: round(box.bottom - visibleBottom),
        top: round(visibleTop - box.top),
        right: round(box.right - visibleRight),
        left: round(visibleLeft - box.left),
      }

      // Actions the player cannot reach. Hit-test rather than trusting
      // geometry, so an action hidden *under* another layer counts too.
      const unreachable = []
      const actions = el.querySelectorAll('button, [role="button"], a[href], input, select, textarea')
      for (const action of actions) {
        if (!isVisible(action)) continue
        const actionBox = action.getBoundingClientRect()
        const shown = visibleRect(action)
        const fullyOut = shown.width < 1 || shown.height < 1
        const mostlyOut = shown.height < actionBox.height * 0.5 - TOL
        if (!fullyOut && !mostlyOut) continue
        // Reachable by scrolling is not stranded.
        if (inScrollableAncestor(action, el)) continue
        unreachable.push({
          selector: label(action),
          text: (action.textContent || action.value || '').replace(/\s+/g, ' ').trim().slice(0, 48),
          box: boxOf(action),
          visibleHeight: shown.height,
        })
        if (unreachable.length >= 6) break
      }

      results.push({
        id: tag(el, 'data-qa-overlay-id'),
        selector: label(el),
        box,
        overflow,
        scrollsY,
        contentOverflows,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        maxHeightUsed: style.maxHeight,
        positionUsed: style.position,
        unreachable,
      })
    }
    return { view: port, overlays: results }
  }

  /**
   * Points to try putting a pointer on, centre first.
   *
   * Nine samples across the middle of the box. Enough that a transient layer
   * covering part of a scroller — a toast, a floating badge — does not read as
   * the whole thing being unreachable, and few enough that hit-testing them all
   * stays free. The edges are deliberately avoided: a point on the boundary
   * hit-tests to the neighbour often enough to be its own source of noise.
   */
  const probePoints = (shown) => {
    const fractions = [0.5, 0.3, 0.7]
    const points = []
    for (const fy of fractions) {
      for (const fx of fractions) {
        points.push({
          x: round(shown.left + shown.width * fx),
          y: round(shown.top + shown.height * fy),
        })
      }
    }
    return points
  }

  /**
   * The overlay an element belongs to, if any.
   *
   * Deliberately shares `OVERLAY_SCOPE` and `isAppFrame` with the overlay
   * check above. The wheel check needs the same answer to "is this a transient
   * layer or the app itself?", and two lists would drift into disagreeing.
   */
  const overlayLayerOf = (el) => {
    let current = el
    while (current && current !== document.documentElement) {
      if (typeof current.matches === 'function' && current.matches(OVERLAY_SCOPE) && !isAppFrame(current)) {
        return current
      }
      current = current.parentElement
    }
    return null
  }

  // ── Scroll candidates ────────────────────────────────────────────────────
  // Every element that declares vertical scrolling and has content to scroll.
  // The verdict for each is decided by the driver after a real wheel event.
  const scrollCandidates = () => {
    const results = []
    for (const el of document.querySelectorAll('*')) {
      const style = getComputedStyle(el)
      if (!/(auto|scroll)/.test(style.overflowY)) continue
      if (el.scrollHeight <= el.clientHeight + 2) continue
      if (!isVisible(el)) continue

      const shown = visibleRect(el)
      const reachable = shown.width >= 8 && shown.height >= 8
      const points = probePoints(shown)

      // Find any point a user could actually put the pointer on. Sampling only
      // the centre cannot tell a modal from a toast: a modal covers the whole
      // scroller, a notification covers one corner. Judging from one sample
      // turned a toast that happened to be up into "the wheel will never reach
      // it" — a finding that failed on one run and passed on the next, which is
      // how a check trains you to ignore it.
      let reached = null
      if (reachable) {
        for (const point of points) {
          const at = document.elementFromPoint(point.x, point.y)
          if (at && (at === el || el.contains(at))) { reached = { point, at }; break }
        }
      }
      const centreHit = reachable ? document.elementFromPoint(points[0].x, points[0].y) : null
      const point = reached?.point ?? points[0]
      const hit = reached?.at ?? centreHit
      const hitIsSelfOrDescendant = Boolean(reached)

      // Something on top of a scroller is usually a bug — but not when the
      // something is an open modal, which is *supposed* to take the screen.
      // The layer has to be one the scroller is not inside: an overlay
      // covering its own scroll container is a genuine overlap.
      const coveringLayer = !hitIsSelfOrDescendant && hit ? overlayLayerOf(hit) : null
      const behindOverlay = Boolean(coveringLayer && !coveringLayer.contains(el))

      results.push({
        id: tag(el, 'data-qa-scroll-id'),
        selector: label(el),
        box: boxOf(el),
        visible: shown,
        reachable,
        point,
        pointsTried: reachable ? points.length : 0,
        // True when the centre was blocked but somewhere else was not — a
        // partial cover, worth seeing even though it is not a failure.
        usedFallbackPoint: Boolean(reached && reached.point !== points[0]),
        centreHitSelector: label(centreHit),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: style.overflowY,
        overscrollBehaviorY: style.overscrollBehaviorY,
        scrollBehavior: style.scrollBehavior,
        // What is actually at the probe point — the difference between "this
        // does not scroll" and "something is sitting on top of it".
        hitSelector: label(hit),
        hitIsSelfOrDescendant,
        behindOverlay,
        coveringLayer: coveringLayer ? label(coveringLayer) : null,
      })
    }
    return results
  }

  const readScrollTop = (id) => {
    const el = document.querySelector(`[data-qa-scroll-id="${id}"]`)
    return el ? el.scrollTop : null
  }

  const resetScrollTop = (id) => {
    const el = document.querySelector(`[data-qa-scroll-id="${id}"]`)
    if (!el) return null
    el.scrollTop = 0
    return el.scrollTop
  }

  /** Does this element still respond to a programmatic scroll at all? */
  const canScrollProgrammatically = (id) => {
    const el = document.querySelector(`[data-qa-scroll-id="${id}"]`)
    if (!el) return null
    const before = el.scrollTop
    el.scrollTop = before + 80
    const after = el.scrollTop
    el.scrollTop = before
    return after !== before
  }

  window.__qaProbe = {
    landmarkAlignment,
    symmetry,
    overlays,
    scrollCandidates,
    readScrollTop,
    resetScrollTop,
    canScrollProgrammatically,
    view,
  }
}
