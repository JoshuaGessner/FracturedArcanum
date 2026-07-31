/**
 * Full account data export (subject access).
 *
 * Its own module because it aggregates six domains — profile, decks, collection,
 * matches, social and trades. Left inside the session code it would force that
 * module to import half the data layer and create four import cycles.
 */
import { _getById, getAccountReadiness, listAccountPasskeys, listAccountSessions } from './accounts.js'
import { db, prepare } from './connection.js'
import { getCollection } from './economy.js'
import { getRecentMatches } from './matches.js'
import { getProfile, listDecks } from './profiles.js'
import { getSocialOverview, listTradesForAccount } from './social.js'

export function exportAccountData(accountId) {
  const account = _getById.get(accountId)
  if (!account) return null
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: account.id,
      username: account.username,
      displayName: account.display_name,
      email: account.email,
      emailVerifiedAt: account.email_verified_at,
      role: account.role,
      accountStatus: account.account_status,
      accountStandardVersion: account.account_standard_version,
      createdAt: account.created_at,
      lastLogin: account.last_login,
      deletedAt: account.deleted_at,
      termsVersion: account.terms_version,
      termsAcceptedAt: account.terms_accepted_at,
      privacyVersion: account.privacy_version,
      privacyAcceptedAt: account.privacy_accepted_at,
      ageGateVersion: account.age_gate_version,
      ageAttestedAt: account.age_attested_at,
      ageAttestation: account.age_attestation,
    },
    readiness: getAccountReadiness(accountId),
    profile: getProfile(accountId),
    decks: listDecks(accountId),
    collection: getCollection(accountId),
    recentMatches: getRecentMatches(accountId),
    social: getSocialOverview(accountId),
    trades: listTradesForAccount(accountId),
    passkeys: listAccountPasskeys(accountId),
    sessions: listAccountSessions(accountId),
    consents: db.prepare(`
      SELECT document_type as documentType, document_version as documentVersion, accepted_at as acceptedAt, locale, source
      FROM account_consents
      WHERE account_id = ?
      ORDER BY accepted_at DESC
    `).all(accountId),
  }
}

