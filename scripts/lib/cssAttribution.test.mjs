import { describe, expect, it } from 'vitest'
import { attributeProperty, attributePseudo, customPropertiesIn } from './cssAttribution.mjs'
import fixture from './__fixtures__/matched-styles.json' with { type: 'json' }

/**
 * `matched-styles.json` is a real `CSS.getMatchedStylesForNode` payload
 * recorded from Chrome against a page that mirrors the constructs App.css
 * uses. `computed` in the same file is the browser's own resolved values, so
 * these tests assert attribution agrees with ground truth rather than with
 * my reading of the protocol docs.
 */
const { matched, computed } = fixture

describe('attributeProperty', () => {
  it('lets !important win even though it sits earlier in the array', () => {
    // The trap: `.shouty` is at a lower index than `.box .panel`, so reading
    // the array backwards attributes max-height to the calc() rule and is
    // wrong. Chrome resolves it to 555px.
    const result = attributeProperty(matched, 'max-height')
    expect(computed.maxHeight).toBe('555px')
    expect(result.value).toBe('555px')
    expect(result.selector).toBe('.shouty')
    expect(result.important).toBe(true)
  })

  it('attributes a longhand that was authored as a shorthand', () => {
    const result = attributeProperty(matched, 'padding-top')
    expect(computed.paddingTop).toBe('8px')
    expect(result.value).toBe('8px')
    expect(result.selector).toBe('.panel')
    expect(result.viaShorthand).toBe(true)
    // Quotes the declaration as written, not the synthesised longhand.
    expect(result.declaration).toBe('padding: 8px 16px 20px 16px')
  })

  it('prefers a directly authored longhand over an earlier shorthand', () => {
    const result = attributeProperty(matched, 'padding-bottom')
    expect(computed.paddingBottom).toBe('40px')
    expect(result.value).toBe('40px')
    expect(result.selector).toBe('.box .panel:not(.inert)')
    expect(result.viaShorthand).toBe(false)
  })

  it('ranks an inline style above every non-important author rule', () => {
    const result = attributeProperty(matched, 'overflow-y')
    expect(computed.overflowY).toBe('scroll')
    expect(result.value).toBe('scroll')
    expect(result.source).toBe('inline')
  })

  it('reports the @container condition that carried the winning rule', () => {
    const result = attributeProperty(matched, 'row-gap')
    expect(computed.rowGap).toBe('12px')
    expect(result.value).toBe('12px')
    expect(result.containerQueries).toEqual(['(width >= 200px)'])
  })

  it('reports the @media condition that carried the winning rule', () => {
    const result = attributeProperty(matched, 'border-top-left-radius')
    expect(computed.borderTopLeftRadius).toBe('20px')
    expect(result.value).toBe('20px')
    expect(result.media).toEqual(['(min-width: 100px)'])
    expect(result.viaShorthand).toBe(true)
  })

  it('excludes rules whose @media or @container condition does not match', () => {
    // Both 99999px blocks must be absent, or a finding could be attributed to
    // a rule that is not in effect.
    expect(JSON.stringify(matched)).not.toContain('99999')
  })

  it('counts how many declarations lost the cascade', () => {
    const result = attributeProperty(matched, 'max-height')
    // .panel, @media(non-matching, excluded), .box .panel -> at least two losers.
    expect(result.overriddenBy).toBeGreaterThanOrEqual(2)
  })

  it('returns null for a property nothing set', () => {
    expect(attributeProperty(matched, 'grid-template-areas')).toBeNull()
  })

  it('tolerates an empty or malformed payload', () => {
    expect(attributeProperty({}, 'max-height')).toBeNull()
    expect(attributeProperty(null, 'max-height')).toBeNull()
    expect(attributeProperty({ matchedCSSRules: [{}] }, 'max-height')).toBeNull()
  })
})

describe('customPropertiesIn', () => {
  it('extracts every var() reference from a calc()', () => {
    expect(customPropertiesIn('calc(var(--app-h, 100svh) - var(--space-6))'))
      .toEqual(['--app-h', '--space-6'])
  })

  it('dedupes repeated references', () => {
    expect(customPropertiesIn('calc(var(--x) + var(--x))')).toEqual(['--x'])
  })

  it('returns nothing for values with no var()', () => {
    expect(customPropertiesIn('400px')).toEqual([])
    expect(customPropertiesIn(undefined)).toEqual([])
  })
})

describe('attributePseudo', () => {
  it('finds ::before rules, which are not in matchedCSSRules', () => {
    expect(attributeProperty(matched, 'height')).toBeNull()
    const result = attributePseudo(matched, 'before', 'height')
    expect(result.value).toBe('4px')
    expect(result.selector).toBe('.panel::before')
  })

  it('finds ::-webkit-scrollbar rules under the scrollbar pseudo type', () => {
    const result = attributePseudo(matched, 'scrollbar', 'width')
    expect(result.value).toBe('6px')
    expect(result.selector).toBe('.panel::-webkit-scrollbar')
  })

  it('returns null for a pseudo type with no rules', () => {
    expect(attributePseudo(matched, 'after', 'height')).toBeNull()
  })
})
