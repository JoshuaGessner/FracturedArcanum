# Passkey Sign-In: Alignment Plan

How Fractured Arcanum's passkey-only sign-in compares with the apps and
standards bodies that have shipped passkeys at scale, what has been changed to
close the gap, and what remains, in order.

This supersedes the **Login** paragraph in `AUTH_ACCOUNT_PRODUCTION_PLAN.md`
§7, which specified "Login asks for username" — the step the industry has since
learned to remove.

---

## 1. What good passkey sign-in looks like

The FIDO Alliance's UX guidelines, Google's web.dev and Chrome identity
guidance, and the shipped behaviour of Google, Apple, GitHub and 1Password
agree on a small set of patterns.

| # | Pattern | Why |
|---|---|---|
| P1 | **Autofill first.** The username field has `autocomplete="username webauthn"` and a *conditional* WebAuthn request runs when the page loads. Focusing the field lists the device's passkeys beside saved passwords; picking one signs in. | FIDO usability research: highest sign-in success of any passkey entry point. Nothing to remember or type. |
| P2 | **Discoverable credentials.** Passkeys are registered with `residentKey: 'required'` so the device stores the account with the key. | Without it, neither autofill nor a username-free button can work. |
| P3 | **A "Sign in with a passkey" button that needs no username.** An empty allow-list lets the device's own sheet choose the account. | Fallback where autofill is unsupported or ignored. |
| P4 | **Username-first remains available.** Typing a username narrows the request to that account's credentials. | Older and hardware-key credentials may not be discoverable. |
| P5 | **No account enumeration.** Starting a sign-in never reveals whether a username exists. | Standard authentication hygiene (OWASP). |
| P6 | **Keep the device in sync (Signal API).** `signalUnknownCredential` when a device offers a passkey the server no longer has; `signalAllAcceptedCredentials` after a passkey is removed; `signalCurrentUserDetails` after sign-in. | Stops the device offering dead passkeys; keeps names current. Chrome 132+. |
| P7 | **Name passkeys by provider.** Use the AAGUID from registration to label a passkey "Apple Passwords" or "Google Password Manager". | Players with several passkeys can tell them apart. |
| P8 | **Upgrade password users automatically.** After a password sign-in, a *conditional create* request lets the browser save a passkey with no prompt. | Chrome 136+ and Safari 18+. The cheapest way off passwords. |
| P9 | **Notify on account changes.** NIST SP 800-63B-4: every recovery event notifies the subscriber; new passkeys should too. | Lets the real owner spot a takeover. |
| P10 | **Recovery stays reachable but secondary.** One primary action; other routes one tap away. | A crowded screen of equal links lowers passkey adoption. |

## 2. Where Fractured Arcanum stood

| Pattern | Before this change |
|---|---|
| P1 Autofill | Absent. The username field had `autocomplete="username"` only. |
| P2 Discoverable | `residentKey: 'preferred'`. Platform passkeys were usually discoverable anyway; nothing guaranteed it. |
| P3 Username-free button | **Absent.** The button refused to start until a username was typed. This was the main source of the "janky" feel: a passkey app asking the player to remember a username. |
| P4 Username-first | Present (it was the only path). |
| P5 Enumeration | **Leaked.** `POST /api/auth/passkey/login/options` returned 404 "No active account with passkeys was found" for unknown names and returned the `accountId` for known ones. |
| P6 Signal API | Absent. |
| P7 Provider names | Absent. Passkeys were "Primary passkey", "Passkey 2". |
| P8 Auto-upgrade | Absent. Legacy users upgrade through a manual screen. |
| P9 Notifications | Absent. Security events are recorded but never shown to the player. |
| P10 Recovery layout | Five equal links under the form. |

Other problems found along the way:

- **Signup retry.** Cancelling the Touch ID / Windows Hello prompt and pressing
  Create again failed with "That username is already taken" for five minutes:
  the unfinished attempt still reserved the name.
- **Sign-in skipped the account status check.** Status was only checked when
  looking an account up by username, so a discoverable sign-in would not have
  checked it at all.
- **Timeout message lost.** The ceremony timeout error was named
  `PasskeyCeremonyTimeout`, but the formatter looked for
  `PasskeyTimeoutError`, so players saw a generic failure instead of "the
  prompt timed out".
- **Stale challenges.** `auth_challenges` was never cleaned up. Autofill makes
  one per sign-in visit, so this needed fixing before P1.
- **The migration-safety test migrated the real local database.** It reopened
  its shared connection with `DATA_DIR` unset, which ran every migration
  against `./data` on each `npm test`. It now uses a throwaway directory.

## 3. Phase 1 — done in this change

| Item | Where |
|---|---|
| P1 autofill sign-in, armed while the sign-in screen is open and withdrawn on leaving | `src/hooks/usePasskeySignIn.ts`, `src/components/AuthGate.tsx` |
| P2 every new passkey is discoverable (one shared registration builder replaces four copies) | `server/passkey-service.js` `buildRegistrationOptions` |
| P3 username-free button; P4 username narrows when typed | `createPasskeyLoginOptions` |
| P5 an unknown username gets the same discoverable request, never a 404; `accountId` removed from the response | `createPasskeyLoginOptions` |
| Account status, user-handle and account-match checks at verify time | `verifyPasskeyLogin` |
| P6 Signal API: unknown credential on failed sign-in, user details after sign-in, accepted list after removing a passkey | `src/passkeys.ts` |
| P7 AAGUID stored; new passkeys named by provider | `server/passkey-providers.js`, `account_authenticators.aaguid` |
| P10 one primary action; recovery behind "Trouble signing in?"; clear message when the browser has no passkey support | `AuthGate` |
| Signup retry from the same device reclaims its own reservation at once | `releaseDeadSignupReservation` |
| Stale challenge sweep | `cleanupSessions` |
| Sign-in screen moved out of `App.tsx` (−155 lines); one `applySignedInSession` for every way in | `AuthGate`, `useAccountActions` |

Tests: `server/passkey-sign-in.test.js` signs assertions with a software P-256
authenticator, so real signature verification runs (including a forged
signature and a replayed challenge). `src/components/AuthGate.test.tsx` and
`src/passkeys.test.ts` cover the screen and the Signal API guards. A Chrome
virtual-authenticator run confirmed signup, autofill sign-in with no clicks,
button sign-in with an empty username, and button sign-in with a username.

### Signal API safety

`signalAllAcceptedCredentials` hides any passkey *not* in the list. A list built
from credential IDs stored in a different encoding than the device's could hide
a working passkey. So it is sent only right after a player removes a passkey,
only when every ID is plain base64url, and never with an empty list. The other
two signals cannot hide a working passkey.

## 4. Remaining phases

Ordered by value to players over effort. Every phase below is additive to the
database; none deletes or rewrites player data.

### Phase 2 — Passkey management (small)

- **Rename a passkey.** `PATCH /api/me/passkeys/:id { name }` with
  `requireAuth`, a rate limit, and a 48-character cap; a Rename button in
  Settings. Call `signalCurrentUserDetails` is not needed — names are local.
- **Show the provider and "this device".** Settings already receives
  `providerName`. Add the provider icon from the community AAGUID registry
  (served as generated SVG, per the asset rules) and mark the passkey used for
  the current session.
- **Nudge a second passkey.** After sign-in, if the account has one passkey and
  it is not synced (`backedUp === false`), prompt once to add another device —
  device-linking already exists. This is the cheapest protection against
  needing recovery at all.

### Phase 3 — Retire legacy passwords (medium)

1. Measure the population:
   ```sql
   SELECT COUNT(*) FROM accounts
   WHERE account_status = 'active' AND deleted_at IS NULL
     AND id NOT IN (SELECT DISTINCT account_id FROM account_authenticators);
   ```
2. **Automatic passkey upgrade (P8).** After a successful legacy password
   sign-in, if `PublicKeyCredential.getClientCapabilities().conditionalCreate`
   is true, run registration with `mediation: 'conditional'`. The browser
   saves a passkey silently; the existing manual upgrade screen stays as the
   fallback. Server side reuses `buildRegistrationOptions` unchanged.
3. Announce a date in the message of the day; after it, hide the "Upgrade an
   old password account" route and return 410 from `/api/auth/login` behind an
   environment flag, so it can be turned back on without a deploy.
4. Do **not** delete password hashes or legacy accounts. The legacy expiry
   sweeper stays off (`LEGACY_MIGRATION_EXPIRY` unset); support can still
   rescue a straggler with a recovery code.

### Phase 4 — Tell players what happened to their account (medium)

NIST SP 800-63B-4 requires recovery to notify the account holder, and the game
has no email. Use what exists:

- `security_events` already records sign-ins via recovery, grants, resets,
  passkey changes and device links. Add `GET /api/me/security-events`
  (last 30 days, event type, time, coarse device from the stored UA hash) and a
  **Recent activity** list in Settings → Account.
- On the next sign-in after a security-relevant event the player did not
  perform in this session, show a one-time banner: "Your account was recovered
  with a support code on Oct 2. Not you? Contact support." Store the
  acknowledgement per event.

### Phase 5 — Sessions (larger; schedule deliberately)

- Move the session token from `localStorage` to an `HttpOnly; Secure;
  SameSite=Lax` cookie, as the original plan anticipated. Socket.IO's handshake
  can read the cookie. Run both for one release (accept either) so open tabs
  are not signed out by the deploy.
- Rotate the session token on privilege change and on recovery (families
  already exist in `session_families`).

### Phase 6 — Watch list

- **Recovery-code strength.** Saved recovery codes are 12 characters from a
  32-symbol alphabet (60 bits); NIST asks for at least 64. A 13-character
  format can be issued for new batches while old codes keep verifying —
  `normalizeRecoveryCode` accepts by length.
- **Immediate mediation** (Chrome origin trial): a sign-in button that shows
  the passkey sheet only if one exists, else falls through to signup. Adopt
  once it ships unflagged.
- **Related Origin Requests** (`/.well-known/webauthn`) if the game is ever
  served from a second domain. Until then, nothing to do.

## 5. Operating rules

- **Never change the RP ID** (`WEBAUTHN_RP_ID`, or the hostname of
  `WEBAUTHN_ORIGIN`) on a live server. Every passkey is bound to it; changing
  it signs every player out of every passkey, permanently.
- **Never change the WebAuthn user handle.** It is the account id, bytes of
  `acct-…`. A new value would file a second, unrelated passkey on the player's
  device.
- **Production needs HTTPS and a DNS name.** `webAuthnContext` refuses plain
  HTTP and IP origins in production, with an explicit error.

## 6. Deploying Phase 1

- **Database:** one additive column, `account_authenticators.aaguid TEXT NOT
  NULL DEFAULT ''`, added at startup by `ensureColumns` if missing. Existing
  rows keep their names and get `''`. No row is rewritten or deleted.
- **Rolling back** to the previous build needs no database restore: the old
  code names its insert columns explicitly, so it ignores the new column.
- **Existing passkeys keep working.** Discoverable ones (most platform
  passkeys) gain autofill and the username-free button immediately; any that
  are not discoverable still work by typing the username first.
- **Rehearsed:** `scripts/update.sh --mode node` was run end to end in a clean
  clone against a pre-update copy of the database (backup, SQLite snapshot,
  `npm ci`, build), then the upgraded server was started against it. Every
  table kept its row count and every player profile was unchanged.

## Sources

- FIDO Alliance, [UX Guidelines for Passkey Creation and Sign-ins](https://fidoalliance.org/wp-content/uploads/2023/05/FIDO-Alliance-UX-Guidelines-for-Passkey-Creation-and-Sign-ins.pdf) and [Passkey Central: Sign in with a passkey](https://www.passkeycentral.org/design-guidelines/required-patterns/sign-in-with-a-passkey)
- web.dev, [Sign in with a passkey through form autofill](https://web.dev/articles/passkey-form-autofill), [Create a passkey](https://web.dev/articles/passkey-registration), [Discoverable credentials deep dive](https://web.dev/articles/webauthn-discoverable-credentials), [Determine the passkey provider with AAGUID](https://web.dev/articles/webauthn-aaguid)
- Chrome for Developers, [Signal API](https://developer.chrome.com/docs/identity/webauthn-signal-api), [Automatic passkey upgrades](https://developer.chrome.com/blog/passkey-automatic-upgrades)
- Apple, [WWDC24: Streamline sign-in with passkey upgrades](https://developer.apple.com/videos/play/wwdc2024/10125/)
- [passkey-authenticator-aaguids](https://github.com/passkeydeveloper/passkey-authenticator-aaguids) community registry
- NIST, [SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html); OWASP, [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
