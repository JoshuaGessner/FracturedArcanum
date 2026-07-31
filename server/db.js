/**
 * Data layer barrel.
 *
 * The implementation lives in `server/db/*.js`, one module per domain. This
 * file re-exports it so `server.js`, `passkey-service.js` and the test suite
 * keep their existing single import site.
 *
 * Modules are acyclic by construction; each module header says why its
 * boundaries fall where they do. Add new queries to the domain module that owns
 * the table, not here.
 *
 * The list below is exactly the public surface the single-file version had.
 * Helpers promoted to `export` so a sibling could reach them are deliberately
 * NOT re-exported — they stay internal to `server/db/`.
 */
export {
  LEGACY_MIGRATION_WINDOW_DAYS,
  db,
  getCurrentLegalVersions,
  openDatabase,
} from './db/connection.js'

export {
  checkRateLimit,
  hashFingerprint,
  hashPassword,
  hashUserAgent,
  verifyPassword,
} from './db/crypto.js'

export {
  acknowledgeAccountRecoveryCodes,
  authenticateAccount,
  cleanupSessions,
  completeAccountRecovery,
  completeAccountRecoveryWithGrant,
  completeAccountRecoveryWithPasskey,
  completeAccountUpgrade,
  completePasskeyDeviceLinkRegistration,
  consumeAuthChallenge,
  createAccount,
  createAuthChallenge,
  createPasskeyDeviceLink,
  createSession,
  deleteAccount,
  deleteAccountPasskey,
  destroySession,
  expireLegacyMigrationAccounts,
  findAccountForPasskeyIdentifier,
  findAccountRecoveryCode,
  findAccountRecoveryGrant,
  generateAccountRecoveryCodes,
  getAccountReadiness,
  getPasskeyCredential,
  getPasskeyDeviceLink,
  hashIp,
  issueAccountRecoveryGrant,
  listAccountPasskeyCredentials,
  listAccountPasskeys,
  listAccountRecoveryGrants,
  listAccountRecoveryStatus,
  listAccountSessions,
  listDeletedAccounts,
  markAccountPendingPasskeySignup,
  markSessionPasskeyReauthenticated,
  reapAbandonedSignups,
  registerAccountPasskey,
  restoreAccount,
  revokeAccountRecoveryGrants,
  revokeAllSessions,
  sessionHasRecentPasskeyReauth,
  updatePasskeyAfterAuthentication,
  validateSession,
} from './db/accounts.js'

export {
  createDeck,
  deleteDeck,
  getActiveDeck,
  getProfile,
  listDecks,
  renameDeck,
  saveDeck,
  selectActiveDeck,
  selectTheme,
  updateDeck,
  validateDeckConfig,
  validateDeckForMatch,
} from './db/profiles.js'

export {
  ALL_CARDS,
  PACK_DEFS,
  acknowledgeMatchSettlement,
  breakdownCard,
  claimDailyReward,
  claimQuestReward,
  claimQuestRewards,
  getCollection,
  getLatestUnacknowledgedSettlement,
  getMatchSettlementForAccount,
  getQuestOverview,
  listCardBorders,
  openPack,
  purchaseCardBorder,
  purchaseTheme,
  questExpiresAt,
  questPeriodKey,
  recordQuestEvent,
  recordQuestEvents,
  rerollQuest,
  resolveMatchResult,
  selectCardBorder,
  settleAuthoritativeMatch,
} from './db/economy.js'

export {
  getLeaderboard,
  getRecentMatches,
} from './db/matches.js'

export {
  acceptTrade,
  addFriend,
  cancelTrade,
  createClan,
  getSocialOverview,
  getTradeById,
  isFriendOf,
  joinClanByInvite,
  leaveClan,
  listTradesForAccount,
  proposeTrade,
  removeFriend,
} from './db/social.js'

export {
  adminDeleteAccount,
  adminIssueRecoveryGrant,
  adminResetAccountCredentials,
  adminRestoreAccount,
  adminSuspendAccount,
  adminUnsuspendAccount,
  assignInitialOwner,
  findOwnerAccountId,
  getAccountById,
  getAccountRole,
  getAdminAccountDetail,
  hasRoleAtLeast,
  listAccounts,
  listAudit,
  recordAudit,
  setAccountRole,
  transferOwnership,
} from './db/admin.js'

export {
  exportAccountData,
} from './db/account-export.js'

// The raw better-sqlite3 handle. `as default` rather than `export default db`
// so the binding stays live across an `openDatabase()` reopen.
export { db as default } from './db/connection.js'
