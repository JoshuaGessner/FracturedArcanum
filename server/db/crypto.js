/**
 * Password hashing, fingerprint hashing, and rate limiting.
 *
 * scrypt so there is no native addon to build.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { prepare } from './connection.js'

// ─── Password hashing (scrypt — no native addon needed) ──────────────────────

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_COST).toString('hex')
  return `${salt}:${derived}`
}

export function verifyPassword(plain, stored) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_COST)
  const expected = Buffer.from(hash, 'hex')
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

// ─── Device fingerprint helper ────────────────────────────────────────────────

export function hashFingerprint(fp) {
  if (!fp) return null
  return createHash('sha256').update(`rc-fp:${fp}`).digest('hex').slice(0, 32)
}

export function hashUserAgent(userAgent) {
  if (!userAgent) return null
  return createHash('sha256').update(`rc-ua:${userAgent}`).digest('hex').slice(0, 24)
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

const _rlCheck = prepare(`SELECT count, window_start FROM rate_limits WHERE key = ?`)
const _rlUpsert = prepare(`
  INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET count = count + 1
`)
const _rlReset = prepare(`
  UPDATE rate_limits SET count = 1, window_start = datetime('now') WHERE key = ?
`)

export function checkRateLimit(key, maxAttempts) {
  const row = _rlCheck.get(key)
  if (!row) {
    _rlUpsert.run(key)
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  const windowAge = Date.now() - new Date(row.window_start + 'Z').getTime()
  if (windowAge > RATE_WINDOW_MS) {
    _rlReset.run(key)
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (row.count >= maxAttempts) {
    return { allowed: false, remaining: 0 }
  }

  _rlUpsert.run(key)
  return { allowed: true, remaining: maxAttempts - row.count - 1 }
}

