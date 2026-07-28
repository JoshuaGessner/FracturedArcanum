/**
 * Pure helpers for the component-vs-viewport scaling check.
 *
 * Lives here rather than inside `scripts/verify-responsive-layout.mjs` so the
 * rule can be unit-tested in `npm test` instead of only inside the browser
 * harness, which needs a Playwright download and a running server.
 */

/** One component's measured box width and the size of its label text. */
export type ScalingMeasurement = {
  width: number
  fontSize: number
}

/** All tracked components measured at a single viewport width. */
export type ScalingSample = {
  viewport: number
  components: Record<string, ScalingMeasurement | undefined>
}

export type ScalingInversion = {
  component: string
  narrower: { viewport: number; width: number; fontSize: number }
  wider: { viewport: number; width: number; fontSize: number }
}

/**
 * Components whose contents are sized relative to the component, paired with
 * the text node that reveals which styling branch won.
 */
export const SCALING_TARGETS = [
  { name: 'builder-card', box: '.builder-card', text: '.builder-card .slot-head strong' },
  { name: 'shop-hub-panel', box: '.shop-hub-panel', text: '.shop-hub-panel .shop-hub-panel-kicker' },
] as const

/**
 * Viewport widths sampled either side of every breakpoint that used to change
 * a component's layout. Pairs are 2px apart so the only thing that can differ
 * between them is which rules matched.
 */
export const SCALING_PROBE_WIDTHS = [
  360, 393, 399, 401, 559, 561, 639, 641, 719, 721, 819, 821, 900, 1180, 1440,
]

/**
 * Finds cases where a component gets *wider* while its type gets *smaller*.
 *
 * A component growing or shrinking with the window is normal. Growing while
 * its text shrinks is not — that can only happen when the rule choosing the
 * type size is measuring something other than the component itself. Before the
 * container-query migration, crossing the 640px breakpoint took a deck-builder
 * card from 190px wide to 294px wide while dropping its name from 16px to
 * 12.48px, because the grid switched to fewer, wider columns at the same
 * moment the viewport-keyed rules decided the screen was "small".
 *
 * Samples are compared in order of width, not viewport, since the same width
 * can be reached from several viewports and it is the width/type relationship
 * that has to stay monotonic.
 */
export function findScalingInversions(
  samples: ScalingSample[],
  targets: ReadonlyArray<{ name: string }> = SCALING_TARGETS,
): ScalingInversion[] {
  const inversions: ScalingInversion[] = []

  for (const target of targets) {
    const series = samples
      .map((sample) => ({ viewport: sample.viewport, measurement: sample.components[target.name] }))
      .filter((entry): entry is { viewport: number; measurement: ScalingMeasurement } =>
        entry.measurement !== undefined)
      .map((entry) => ({ viewport: entry.viewport, ...entry.measurement }))
      .sort((a, b) => a.width - b.width)

    for (let index = 1; index < series.length; index += 1) {
      const narrower = series[index - 1]
      const wider = series[index]
      if (wider.width > narrower.width && wider.fontSize < narrower.fontSize) {
        inversions.push({
          component: target.name,
          narrower: { viewport: narrower.viewport, width: narrower.width, fontSize: narrower.fontSize },
          wider: { viewport: wider.viewport, width: wider.width, fontSize: wider.fontSize },
        })
      }
    }
  }

  return inversions
}

/** One-line summary of an inversion, for CLI output. */
export function formatInversion(inversion: ScalingInversion): string {
  const { component, narrower, wider } = inversion
  return `${component}: ${narrower.width}px box / ${narrower.fontSize}px text (viewport ${narrower.viewport})`
    + ` → ${wider.width}px box / ${wider.fontSize}px text (viewport ${wider.viewport})`
    + ' — wider box, smaller text'
}
