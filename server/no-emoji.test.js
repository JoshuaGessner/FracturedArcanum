import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CARD_LIBRARY } from './game.js'

/**
 * The game draws its own marks — tribe sigils and interface glyphs from
 * scripts/lib/glyph-art.mjs — so no emoji or pictographic symbol ships in
 * production UI. Platform emoji change colour, size and style from one OS to
 * the next and fight the card art. Tests and dev scripts are out of scope.
 */
// Lives with the server tests because it reads files from disk, which the
// client's tsconfig (no Node types) cannot. It scans both trees.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const PICTOGRAPHIC = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}]/u

function shippedFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return shippedFiles(full)
    if (!/\.(ts|tsx|css|js)$/.test(entry) || /\.test\./.test(entry)) return []
    return [full]
  })
}

describe('no emoji in shipped UI', () => {
  it('cards carry no emoji', () => {
    for (const card of CARD_LIBRARY) {
      expect(JSON.stringify(card), card.id).not.toMatch(PICTOGRAPHIC)
    }
  })

  it('client and server source render no pictographic symbols', () => {
    const roots = [path.join(ROOT, 'src'), path.join(ROOT, 'server')]
    const generated = new Set([path.join(ROOT, 'server', 'game.js'), path.join(ROOT, 'server', 'ai.js')])
    const offenders = []
    for (const root of roots) {
      for (const file of shippedFiles(root)) {
        if (generated.has(file)) continue
        readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
          const code = line.trim()
          if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
          if (PICTOGRAPHIC.test(line)) offenders.push(`${path.relative(ROOT, file)}:${index + 1}: ${code.slice(0, 80)}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })
})
