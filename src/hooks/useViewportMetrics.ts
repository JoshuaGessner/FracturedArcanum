import { useEffect, useState } from 'react'

/**
 * Single source of truth for "how much screen do we actually have".
 *
 * CSS viewport units cannot answer this correctly on phones:
 *
 *   - `100vh`  is the *large* viewport. On iOS Safari it stays large even while
 *              the toolbar is on screen, so the bottom of the layout is hidden.
 *   - `100dvh` tracks the toolbar, but it grows past the initial containing
 *              block. Any ancestor with `overflow: hidden` then clips whatever
 *              sits at the bottom — for us, the nav bar.
 *   - `100svh` is stable but permanently short once the toolbar retracts.
 *
 * None of them shrink for the software keyboard, and Safari reports
 * `env(safe-area-inset-bottom)` as `0` whenever the toolbar is hidden
 * (https://developer.apple.com/forums/thread/716552), so safe-area padding
 * alone can't be trusted either.
 *
 * `visualViewport` is the only API that reports the region the user can
 * actually see. We mirror it onto the root element as custom properties and
 * let the layout build on those instead.
 *
 * Published properties:
 *   --app-h     visible height in px — what the shell sizes itself to
 *   --app-w     visible width in px
 *   --kb-inset  height hidden by the software keyboard, 0 when closed
 *   --vv-top    visual viewport offset, for pinning fixed chrome under the keyboard
 *
 * Every property has a CSS-unit fallback (`100svh` etc.) so the first paint and
 * any no-JS/SSR pass are still laid out sensibly.
 */
export function useViewportMetrics(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const root = document.documentElement
    const viewport = window.visualViewport ?? null
    let frame = 0

    const measure = () => {
      frame = 0

      // Fall back to innerHeight where visualViewport is unavailable (jsdom,
      // older Android WebViews). It is wrong about the keyboard but never
      // wrong about the toolbar, which is the case that breaks our layout.
      const height = viewport?.height ?? window.innerHeight
      const width = viewport?.width ?? window.innerWidth
      const offsetTop = viewport?.offsetTop ?? 0

      // When the keyboard opens, the visual viewport shrinks but the layout
      // viewport does not. The difference is the space the keyboard stole.
      const keyboardInset = Math.max(0, Math.round(window.innerHeight - height - offsetTop))

      root.style.setProperty('--app-h', `${Math.round(height)}px`)
      root.style.setProperty('--app-w', `${Math.round(width)}px`)
      root.style.setProperty('--kb-inset', `${keyboardInset}px`)
      root.style.setProperty('--vv-top', `${Math.round(offsetTop)}px`)

      // Lets CSS branch on shape without a media query, so a short landscape
      // phone and a short desktop window can be treated the same way.
      root.dataset.viewportShape = height < 620 ? 'short' : 'tall'
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(measure)
    }

    measure()

    // `scroll` matters as much as `resize`: on iOS the toolbar retracts during
    // a scroll, changing the visible height without firing a resize.
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
    }
  }, [])
}

/**
 * Mirrors an element's rendered height onto a CSS custom property.
 *
 * Overlays need to know how tall the dock chrome is so they can clear it.
 * Hard-coding that height is what produced the stack of `max-height: 720px`
 * overrides in App.css — the numbers drift the moment a label wraps or a
 * safe-area inset appears. Measuring is stable.
 *
 * Returns a *callback ref*, not a ref object. The chrome mounts later than
 * the shell — the nav bar only exists once the player is past the auth gate —
 * and mutating a ref object's `.current` does not re-run an effect, so an
 * effect-based version publishes `0px` on mount and never corrects itself.
 */
export function useMeasuredHeightVar(property: string): (node: HTMLElement | null) => void {
  const [node, setNode] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const root = document.documentElement

    if (!node) {
      root.style.setProperty(property, '0px')
      return
    }

    const publish = () => {
      root.style.setProperty(property, `${Math.round(node.getBoundingClientRect().height)}px`)
    }

    publish()

    // ResizeObserver is missing in jsdom; the initial measurement above is
    // enough there, since nothing resizes during a test render.
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(publish)
    observer.observe(node)

    return () => {
      observer.disconnect()
      root.style.setProperty(property, '0px')
    }
  }, [node, property])

  return setNode
}
