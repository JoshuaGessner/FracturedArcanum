import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CARD_LIBRARY } from './game.js'
import { EFFECT_LABELS, UI_ASSETS } from '../src/constants.ts'

/**
 * Every asset the client registers must exist on disk. A missing file is a
 * broken image at runtime, not a build error, so nothing else catches it —
 * the Overwhelm seal shipped as a 404 for exactly that reason.
 */
// Lives with the server tests because it reads files from disk.
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

function registeredPaths(node) {
  if (typeof node === 'string') return [node]
  return Object.values(node).flatMap(registeredPaths)
}

describe('registered UI assets', () => {
  it('every path in UI_ASSETS exists under public/', () => {
    const missing = registeredPaths(UI_ASSETS).filter((assetPath) => !existsSync(path.join(PUBLIC_DIR, assetPath)))
    expect(missing).toEqual([])
  })

  it('every keyword and every card effect has a seal', () => {
    const effects = new Set([...Object.keys(EFFECT_LABELS), ...CARD_LIBRARY.map((card) => card.effect).filter(Boolean)])
    const unsealed = [...effects].filter((effect) => !UI_ASSETS.effects[effect])
    expect(unsealed).toEqual([])
  })
})
