import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const children = new Set()
const tempDirs = new Set()
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  children.clear()
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs.clear()
})

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function waitForOutput(child, output, pattern, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}. Output:\n${output.text}`)), timeoutMs)
    const check = () => {
      if (!pattern.test(output.text)) return
      clearTimeout(timeout)
      child.stdout.off('data', check)
      child.stderr.off('data', check)
      resolve()
    }
    child.stdout.on('data', check)
    child.stderr.on('data', check)
    check()
  })
}

describe('production server smoke test', () => {
  it('boots against an isolated database, serves health, and shuts down gracefully', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fa-server-smoke-'))
    tempDirs.add(dataDir)
    const port = await reservePort()
    const output = { text: '' }
    const child = spawn(process.execPath, ['server/server.js'], {
      cwd: repoRoot,
      env: { ...process.env, DATA_DIR: dataDir, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.add(child)
    child.stdout.on('data', (chunk) => { output.text += chunk })
    child.stderr.on('data', (chunk) => { output.text += chunk })

    await waitForOutput(child, output, /arena service listening/)
    const response = await fetch(`http://127.0.0.1:${port}/api/health`)
    expect(response.ok).toBe(true)

    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.kill('SIGTERM')
    expect(await exited).toBe(0)
    expect(output.text).toMatch(/SIGTERM received/)
    expect(output.text).toMatch(/Server closed/)
    children.delete(child)
  })
})
