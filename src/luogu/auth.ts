/**
 * Credential resolution for the Luogu tools.
 *
 * The plugin deliberately has no login/logout flow. It only consumes a cookie
 * that the *user* configures, layered like this (highest priority first):
 *
 *  1. the resolved `luogu` settings section (user-edited document),
 *  2. the literal `cookie` value of the plugin composition `Config`,
 *  3. the `cookieEnv` environment variable (default `LUOGU_COOKIE`),
 *  4. nothing — an anonymous read may still proceed by minting a fresh
 *     `__client_id` from the site; authenticated actions error clearly.
 *
 * A `cookie` field is also derived when the user supplies only a `uid`
 * together with a `clientId`, so the common `_uid` + `__client_id` pair works
 * without pasting a full Cookie header.
 * @module
 */

import { LuoguError } from './http.ts'

/** A parsed cookie bundle ready to attach to a request. */
export interface LuoguCredential {
  /** Full `Cookie` header value (may be empty for anonymous requests). */
  cookie: string
  /** Numeric user id when known. */
  uid?: string
  /** Client id when known. */
  clientId?: string
}

/** Cookie pair names Luogu honours. */
const UID_KEYS = ['_uid', 'uid'] as const
const CLIENT_KEYS = ['__client_id', 'cliend_id'] as const

/** Parse a full Cookie header value into name/value pairs. */
export function parseCookieHeader(cookie: string | undefined): Record<string, string> {
  const pairs: Record<string, string> = {}
  if (cookie === undefined || cookie.length === 0) return pairs
  for (const part of cookie.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key.length > 0 && value.length > 0) pairs[key] = value
  }
  return pairs
}

/** Build a credential from config/env values, deriving missing pieces. */
export function buildCredential(input: {
  cookie?: string | undefined
  uid?: string | undefined
  clientId?: string | undefined
}): LuoguCredential {
  const rawPairs = parseCookieHeader(input.cookie)
  // Fields may come from either the explicit header cookie or dedicated fields.
  let uid = input.uid
  if (uid === undefined) {
    for (const key of UID_KEYS) {
      const v = rawPairs[key]
      if (v !== undefined) { uid = v; break }
    }
  }
  let clientId = input.clientId
  if (clientId === undefined) {
    for (const key of CLIENT_KEYS) {
      const v = rawPairs[key]
      if (v !== undefined) { clientId = v; break }
    }
  }
  // Normalize into a single cookie string: keep supplied pairs and fill gaps.
  const merged: Record<string, string> = { ...rawPairs }
  if (uid !== undefined && merged['_uid'] === undefined) merged['_uid'] = uid
  if (clientId !== undefined && merged['__client_id'] === undefined) {
    merged['__client_id'] = clientId
  }
  const cookie = Object.entries(merged)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
  return { cookie, ...uid === undefined ? {} : { uid }, ...clientId === undefined ? {} : { clientId } }
}

/** Random alphanumeric id generator for the anonymous client id. */
export function generateClientId(length = 32): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

/** A read-only environment accessor so this module stays testable. */
export type EnvAccessor = (name: string) => string | undefined

const processEnv: EnvAccessor = (name) => {
  const value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.[name]
  return value
}

/** Resolve the currently effective credential from user config + env. */
export function resolveCredential(
  section: {
    cookie?: string
    uid?: string
    clientId?: string
    cookieEnv?: string
  },
  env: EnvAccessor = processEnv,
): LuoguCredential {
  // 1/2. Settings/Config literal cookie, or configured uid/clientId.
  if (section.cookie !== undefined && section.cookie.trim().length > 0) {
    return buildCredential({
      cookie: section.cookie,
      uid: section.uid,
      clientId: section.clientId,
    })
  }
  // 3. Environment variable fallback.
  const envName = section.cookieEnv ?? 'LUOGU_COOKIE'
  const envCookie = env(envName)
  if (envCookie !== undefined && envCookie.trim().length > 0) {
    return buildCredential({ cookie: envCookie, uid: section.uid, clientId: section.clientId })
  }
  if (section.uid !== undefined && section.clientId !== undefined) {
    return buildCredential({ uid: section.uid, clientId: section.clientId })
  }
  // 4. Anonymous.
  return { cookie: '' }
}

/**
 * Whether a credential can perform authenticated actions. Anonymous reads are
 * allowed with an empty cookie; authenticated actions (submit, own record list)
 * are not.
 */
export function isAuthenticated(credential: LuoguCredential): boolean {
  return credential.cookie.length > 0 && credential.uid !== undefined
}

/** Build the error a tool raises when an authenticated action has no session. */
export function requireAuthenticated(action: string): never {
  throw new LuoguError(
    'UNAUTHENTICATED',
    `${action} requires a Luogu login. Configure your Luogu cookie under the "luogu" `
      + 'settings namespace or the LUOGU_COOKIE environment variable '
      + '(login is user-configured; this plugin does not log you in or out).',
  )
}
