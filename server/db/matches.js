/**
 * Match history and leaderboard reads.
 */
import { prepare } from './connection.js'

// ─── Match history ───────────────────────────────────────────────────────────

const _getRecentMatches = prepare(`
  SELECT * FROM match_log WHERE account_id = ? ORDER BY played_at DESC LIMIT 20
`)

export function getRecentMatches(accountId) {
  return _getRecentMatches.all(accountId)
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

const _getLeaderboard = prepare(`
  SELECT p.account_id, a.display_name, p.season_rating, p.wins, p.losses, p.updated_at
  FROM player_profiles p JOIN accounts a ON a.id = p.account_id
  ORDER BY p.season_rating DESC, p.wins DESC, p.losses ASC, p.updated_at DESC
  LIMIT 25
`)

export function getLeaderboard() {
  return _getLeaderboard.all()
}

