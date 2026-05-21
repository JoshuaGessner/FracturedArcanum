# Fractured Arcanum - Passkey-Only Account Auth Plan

> Status: revised direction. The production account system should move to passkey-only authentication with no email collection, no email verification, and no password reset. Existing username/password work becomes a migration bridge only. The goal is a lower-friction player login that is still much harder to automate at scale than email/password accounts.

---

## 1. Product Decision

Farcanum accounts should be passkey-first and passkey-only for normal production login.

Do not require or collect email addresses for account creation. Do not build account recovery around email. Do not send verification or password-reset messages. Avoid email deliverability, provider costs, inbox friction, and privacy burden unless the product later needs email for a separate, explicit reason.

Production identity should rely on:

- username or display name for player-facing identity;
- one or more registered passkeys for authentication;
- device, IP, user-agent, rate-limit, and behavior signals for abuse control;
- versioned legal consent and age attestation stored server-side;
- account status and moderation state for enforcement;
- optional recovery codes or support-assisted recovery for lost passkeys.

---

## 2. Chosen Domain Model

The real app origin is:

```text
https://farcanum.anomalousinteractive.com
```

The public marketing URL is:

```text
https://farcanum.com
```

`farcanum.com` forwards users to the app subdomain. Passkeys must bind to the real app host, not the marketing redirect. Treat `farcanum.com` as the primary marketed URL and `farcanum.anomalousinteractive.com` as the canonical app origin.

Production WebAuthn configuration:

```bash
NODE_ENV=production
CLIENT_ORIGIN=https://farcanum.anomalousinteractive.com
WEBAUTHN_RP_ID=farcanum.anomalousinteractive.com
WEBAUTHN_ORIGIN=https://farcanum.anomalousinteractive.com
WEBAUTHN_RP_NAME="Fractured Arcanum"
```

`farcanum.com` should use a normal redirect that preserves paths and query strings. Do not use masked forwarding or iframe forwarding.

Fractured Arcanum has no real-money purchase flow in the current production plan. Legal/account copy should not include store, checkout, refund, subscription, chargeback, payment processor, or paid-item terms unless that product decision changes later.

---

## 3. Target Account States

### New Account

New users create an account by:

1. Choosing a username and display name.
2. Passing automated signup abuse checks.
3. Accepting Terms of Service and Privacy Policy.
4. Completing age eligibility or guardian consent attestation.
5. Registering a passkey with user verification preferred for normal users and required for admin/owner accounts.

The server creates the account only after passkey registration succeeds. No password or email is required.

### Existing Account

Existing username/password users log in one final time with their current credentials, then are blocked into migration before normal app access.

Migration requires:

1. Current password proof.
2. Terms/privacy acceptance.
3. Age attestation.
4. Passkey registration.
5. Abuse checks against device/IP/account-history signals.

After migration, password login should be disabled for that account. The password hash may remain temporarily for rollback/support, but it should no longer authorize normal sessions.

### Admin And Owner Account

Admin and owner accounts require stricter passkey settings:

- WebAuthn user verification required.
- At least two passkeys recommended before public launch.
- Privileged routes require a ready account and at least one active passkey.
- Sensitive admin actions should require recent passkey reauthentication.

---

## 4. Bot And Alt-Account Strategy

Passkeys do not magically prevent alternate accounts, but they raise the cost of mass automation. The server should combine passkeys with layered friction and detection.

### Signup Throttles

Apply rate limits at multiple levels:

- IP address.
- IP subnet or ASN where feasible.
- Device fingerprint hash.
- User-agent hash.
- IP plus user-agent combination.
- Account creation per rolling day and week.
- Failed passkey challenge starts and verifications.

Keep current anti-sybil counters, but tune them for passkey-only signup.

### Device And Browser Signals

Store privacy-preserving hashes, not raw high-entropy fingerprints.

Useful signals:

- existing client device fingerprint hash;
- user-agent hash;
- timezone bucket;
- language bucket;
- platform/browser family;
- WebAuthn authenticator attachment and backup state;
- whether the passkey is platform, roaming, single-device, or synced multi-device.

Do not treat device fingerprinting as proof of identity. Treat it as an abuse signal that contributes to risk scoring.

### Progressive Trust

New accounts should start in a low-trust state until they build normal play history.

Low-trust restrictions can include:

- limited account creations per device/IP;
- delayed access to trading;
- minimum account age before friend challenges or trades;
- stricter queue and shop rate limits;
- lower complaint/report priority weight until trust increases;
- extra moderation flags for repeated concede/farm patterns.

Trust can increase through:

- completed tutorial/onboarding;
- normal match completion history;
- account age;
- absence of abuse reports;
- stable device/session history;
- passkey reauthentication for sensitive actions.

### Alt Account Detection

Flag clusters that share suspicious overlap:

- same device fingerprint across many accounts;
- same IP/user-agent creating many accounts quickly;
- repeated transfers/trades among fresh accounts;
- synchronized match outcomes or concede farming;
- burst signup patterns from the same network;
- multiple accounts registering passkeys from the same suspicious environment.

Initial enforcement should be conservative: flag, rate-limit, and require review before permanent action unless abuse is obvious.

### Optional Human Friction

If bot pressure appears, add friction only at risky moments:

- challenge or CAPTCHA after risk threshold, not for every user;
- invite code or waitlist during attack periods;
- phone verification only if the game later needs stronger identity, because it adds privacy and accessibility costs;
- no payment verification, because the current production plan has no real-money purchases.

---

## 5. Database Plan

Keep existing user/game data keyed by `account_id`. Use additive migrations only.

### Accounts

Keep or add:

```sql
account_status TEXT NOT NULL DEFAULT 'active';
account_standard_version INTEGER NOT NULL DEFAULT 0;
account_setup_required INTEGER NOT NULL DEFAULT 1;
terms_version TEXT NOT NULL DEFAULT '';
terms_accepted_at TEXT;
terms_accepted_ip_hash TEXT;
terms_accepted_ua_hash TEXT;
privacy_version TEXT NOT NULL DEFAULT '';
privacy_accepted_at TEXT;
privacy_accepted_ip_hash TEXT;
privacy_accepted_ua_hash TEXT;
age_gate_version TEXT NOT NULL DEFAULT '';
age_attested_at TEXT;
age_attestation TEXT NOT NULL DEFAULT '';
last_security_event_at TEXT;
failed_login_count INTEGER NOT NULL DEFAULT 0;
locked_until TEXT;
deleted_at TEXT;
passkey_required INTEGER NOT NULL DEFAULT 1;
password_login_disabled_at TEXT;
trust_level TEXT NOT NULL DEFAULT 'new';
risk_score INTEGER NOT NULL DEFAULT 0;
```

Deprecate for production auth:

```sql
email TEXT;
email_normalized TEXT;
email_verified_at TEXT;
email_verification_required INTEGER;
password_reset_required INTEGER;
```

Do not drop existing columns immediately. Leave them nullable/unused until a later cleanup migration after the passkey-only rollout is stable.

### Passkey Security

Use `account_authenticators` as the core credential table:

```sql
CREATE TABLE IF NOT EXISTS account_authenticators (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  credential_public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  backed_up INTEGER NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
```

Add optional metadata columns later if useful:

```sql
authenticator_attachment TEXT;
aaguid TEXT;
first_ip_hash TEXT;
first_ua_hash TEXT;
last_ip_hash TEXT;
last_ua_hash TEXT;
```

### Abuse Tables

Add a compact account risk table if the existing counters become crowded:

```sql
CREATE TABLE IF NOT EXISTS account_risk_events (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  ip_hash TEXT,
  ua_hash TEXT,
  device_fp_hash TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_account_risk_events_account
  ON account_risk_events(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_risk_events_signal
  ON account_risk_events(ip_hash, ua_hash, created_at DESC);
```

---

## 6. Server Route Plan

### Public Routes

Use passkey-only signup and login:

- `POST /api/auth/passkey/signup/options`
  - validates username/display name/legal/age payload;
  - runs signup risk checks;
  - creates a short-lived registration challenge;
  - does not create the account yet, or creates a pending account that cannot access the app.

- `POST /api/auth/passkey/signup/verify`
  - verifies WebAuthn registration;
  - creates or activates the account;
  - stores legal/age consent evidence;
  - creates the first passkey;
  - issues a session.

- `POST /api/auth/passkey/login/options`
  - accepts username;
  - rate-limited by username/IP/device;
  - returns allowed credentials for the account.

- `POST /api/auth/passkey/login/verify`
  - verifies challenge and passkey;
  - updates passkey counter/last-used metadata;
  - issues a session.

No public email verification or password reset routes should exist in the final passkey-only design.

### Migration Routes

Keep compatibility routes only for legacy migration:

- `POST /api/auth/login`
  - verifies old username/password;
  - if account is not migrated, returns an upgrade-only session or regular session locked to account setup;
  - if account is already migrated, rejects password login and asks for passkey.

- `POST /api/me/passkey-upgrade/options`
  - authenticated by legacy proof;
  - starts passkey registration.

- `POST /api/me/passkey-upgrade/verify`
  - verifies passkey;
  - stores legal/age acceptance;
  - marks account ready;
  - disables password login for normal auth.

### Account Routes

- `GET /api/me/account-requirements`
- `GET /api/me/passkeys`
- `POST /api/auth/passkey/register/options`
- `POST /api/auth/passkey/register/verify`
- `DELETE /api/me/passkeys/:id`
- `POST /api/me/passkey-device-links`
- `POST /api/auth/passkey/device-link/options`
- `POST /api/auth/passkey/device-link/verify`
- `GET /api/me/sessions`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/me/export`
- `POST /api/me/delete`

Do not allow deleting the last passkey unless another recovery method is intentionally introduced.

Use device-link routes when a player is signed in on one device and needs to add a phone or second computer. Use recovery routes only when all current passkeys are unavailable.

---

## 7. Client UX Plan

### Signup

The first screen should ask for:

- username;
- display name;
- age eligibility or guardian consent;
- Terms of Service acceptance;
- Privacy Policy acknowledgement;
- passkey creation.

The primary action should be `Create Passkey Account`.

If the browser does not support passkeys, show a clear unsupported-browser message. Do not offer email/password fallback in production.

### Login

Login asks for username and offers `Sign In With Passkey`.

Keep legacy password login hidden behind a migration-only path until all existing users are migrated. Label it clearly as `Upgrade Existing Password Account` rather than normal login.

### Settings Account Panel

Settings should include:

- registered passkeys;
- add passkey;
- rename passkey;
- remove passkey when at least two exist;
- active sessions;
- logout all sessions;
- account export;
- account deletion;
- legal versions accepted;
- trust/restriction status if the account is limited.

---

## 8. Recovery Policy Without Email

Passkey-only accounts need an intentional lost-account policy.

Recommended initial policy:

1. Encourage users to add at least two passkeys.
2. Generate one-time recovery codes after account creation or first Settings visit.
3. Store only hashes of recovery codes.
4. Let a recovery code register a new passkey and revoke old sessions.
5. For accounts without recovery codes or a second passkey, support recovery is not guaranteed.

Recovery codes are cheaper and more private than email. They also avoid building a mail stack.

Normal multi-device setup should not use recovery. A signed-in player can create a short-lived device-link URL from Settings after recent passkey reauthentication, open it on another device, and register a new passkey there. Device links are one-time use, stored as hashed secrets, expire quickly, and add the new passkey without revoking existing passkeys or sessions.

Support-assisted recovery should be manual and conservative, especially for owner/admin accounts.

---

## 9. Security Requirements

### Sessions

- Store only hashed session tokens.
- Track session family, auth method, IP hash, user-agent hash, and last seen time.
- Revoke all sessions after passkey changes, recovery-code use, role changes, or account deletion.
- Consider moving from `localStorage` bearer tokens to secure cookies later if the app adds more web attack surface.

### Passkeys

- Verify origin, RP ID, challenge, counter, and user presence.
- Require user verification for admin/owner.
- Prefer user verification for normal players.
- Store challenges server-side with short TTL and one-time use.
- Reject replayed challenges.
- Track passkey creation and authentication as security events.

### Abuse Controls

- Rate-limit signup challenge creation and verification.
- Rate-limit login challenge creation and verification.
- Rate-limit account deletion/export/logout-all.
- Lock or cool down accounts with repeated failed passkey verification.
- Flag suspicious account clusters for admin review.
- Delay or restrict high-abuse features for low-trust accounts.

---

## 10. Migration Plan

### Phase A: Freeze Email/Password Expansion

- Stop adding email-provider work.
- Remove public-facing password reset and email verification from the target plan.
- Keep existing email/password code only as temporary migration code until implementation is rewritten.

### Phase B: Passkey-Only Signup

- Add passkey signup options/verify routes.
- Make account creation complete only after passkey registration succeeds.
- Add legal/age acceptance to passkey signup.
- Apply signup risk scoring before creating active accounts.

### Phase C: Existing-User Migration

- Let existing users prove ownership with current username/password.
- Block normal app access until passkey registration and legal/age acceptance are complete.
- Disable normal password login after successful passkey migration.
- Preserve profile, collection, decks, social, matches, and economy data.

### Phase D: Remove Email/Password Product Surface

- Remove email fields from signup UI.
- Remove password reset UI.
- Remove production email provider env docs.
- Remove or hide password login after migration window.
- Keep database columns temporarily for rollback and historical compatibility.

### Phase E: Recovery Codes

- Add recovery-code generation.
- Add recovery-code verification to register a replacement passkey.
- Add Settings UI to regenerate recovery codes after passkey reauthentication.
- Add Settings UI for short-lived passkey device links so players can enroll another device without destructive recovery.

---

## 11. Testing Requirements

### Database Tests

- Passkey signup creates account, authenticator, consent rows, profile, and session.
- Existing password account migrates to passkey without losing game data.
- Migrated account cannot use password login for normal sessions.
- Last passkey cannot be removed.
- Recovery codes are hashed and one-time use.
- Low-trust/risk events are persisted.

### Server Tests

- Passkey signup options are rate-limited.
- Passkey signup verify rejects replayed challenges.
- Passkey login verify rejects wrong origin/RP/challenge.
- Unready accounts are blocked from shop, social, queue/socket, and admin routes.
- Owner/admin routes require passkey user verification policy.
- Alt-account throttles trigger for device/IP burst signup.

### Client Tests

- Signup requires passkey-capable browser.
- Signup has legal and age gates.
- Login supports passkey only.
- Legacy migration path is separate from normal login.
- Settings Account lists passkeys, sessions, legal versions, export, and deletion.
- Mobile layout passes at 375px.

### Manual QA

- New passkey account on desktop.
- New passkey account on mobile.
- Existing password account migration.
- Owner account migration and admin access.
- Add second passkey.
- Link another device from a signed-in desktop to a phone.
- Remove non-last passkey.
- Logout all sessions.
- Account export.
- Account deletion.
- Burst signup attempts are throttled.
- Socket queue rejects unready account.

---

## 12. Production Readiness Checklist

- HTTPS active on `https://farcanum.anomalousinteractive.com`.
- `farcanum.com` redirects to the app host without masked forwarding.
- `WEBAUTHN_RP_ID=farcanum.anomalousinteractive.com`.
- `WEBAUTHN_ORIGIN=https://farcanum.anomalousinteractive.com`.
- Passkey signup, login, and migration pass on desktop and mobile.
- Existing users can migrate without losing profile/deck/collection data.
- Owner/admin accounts have passkeys before privileged access.
- Signup risk thresholds are configured and tested.
- Low-trust restrictions are documented and visible enough for support.
- Legal documents are final and versioned.
- Account export/deletion paths work.
- Safe updater backs up SQLite before migrations.
- `npm test`, `npm run lint`, `npm run build`, and `npm run qa:viewport` pass.

---

## 13. Implementation Notes

The first implementation pass removed the public email/password-reset product surface, added passkey account creation routes, and converted account readiness to passkey plus legal/age setup. Existing username/password login now remains as a legacy migration bridge for accounts that have not completed passkey setup.

Remaining cleanup order:

1. Add recovery codes before removing all password fallback paths.
2. Add recent-passkey reauthentication for account deletion, recovery-code regeneration, role changes, and other sensitive actions.
3. Add explicit low-trust account state and risk events for account clusters.
4. Remove or hide legacy password login after the migration window.
5. Keep old database columns until after a stable rollout and backup window.

Do not drop existing data columns in the same release that changes the auth model. Keep the rollout additive and reversible.
