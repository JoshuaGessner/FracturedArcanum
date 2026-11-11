/**
 * Passkey provider names by authenticator model ID (AAGUID).
 *
 * A registration reports which app or device created the passkey. Naming the
 * passkey after it ("iCloud Keychain", "Google Password Manager") is what lets
 * a player with several passkeys tell them apart in Settings, and is the
 * pattern Google's and the FIDO Alliance's passkey-management guidance
 * recommends over generic labels like "Passkey 2".
 *
 * Sourced from the community registry at
 * github.com/passkeydeveloper/passkey-authenticator-aaguids, which exists for
 * exactly this purpose. Only the common providers are listed; an unknown or
 * all-zero AAGUID (many providers send zeros for privacy) falls back to the
 * caller's label, so a missing entry costs a nicer name, never a sign-in.
 */
const PROVIDER_NAMES = Object.freeze({
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
  'b5397666-4885-aa6b-cebf-e52262a439a2': 'Chromium Browser',
  '771b48fd-d3d4-4f74-9232-fc157ab0507a': 'Edge on Mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'Apple Passwords',
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'iCloud Keychain (Managed)',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
  '0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6': 'Keeper',
  'b84e4048-15dc-4dd0-8640-f4f60813c8af': 'NordPass',
  '53414d53-554e-4700-0000-000000000000': 'Samsung Pass',
  'f3809540-7f14-49c1-a8b3-8f813b225541': 'Enpass',
})

const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000'

/** Normalised AAGUID, or '' when absent or the privacy-preserving all-zero value. */
export function normalizeAaguid(aaguid) {
  const value = String(aaguid ?? '').trim().toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) && value !== ZERO_AAGUID
    ? value
    : ''
}

/** Friendly provider name for an AAGUID, or '' when it is not one we know. */
export function passkeyProviderName(aaguid) {
  return PROVIDER_NAMES[normalizeAaguid(aaguid)] ?? ''
}

/**
 * The name to store for a newly registered passkey: the provider when known,
 * otherwise the label the flow supplied ("Recovery passkey", "Passkey 2").
 */
export function defaultPasskeyName(aaguid, fallback) {
  return passkeyProviderName(aaguid) || String(fallback ?? '').trim() || 'Passkey'
}
