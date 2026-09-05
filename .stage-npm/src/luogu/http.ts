/**
 * Minimal HTTP client for Luogu's private JSON endpoints.
 *
 * Luogu's private API is not a public contract: endpoints and response shapes
 * change. To keep the risk in one place, every request funnels through
 * {@link requestJson} here, and the decoders in this module own the dual
 * legacy/Lentille envelope shapes.
 *
 * Auth is cookie-based. The plugin never logs in or out: it uses whatever
 * cookie string the user configured (see {@link LuoguCredentialResolver}) and
 * only mints an anonymous `__client_id` when needed for a non-authenticated
 * read. There is deliberately no logout anywhere in the plugin.
 * @module
 */

import { CONTENT_ONLY_QUERY, CSRF_TOKEN_REGEX, ENDPOINTS, LUOGU_ORIGIN } from './constants.ts'

/** Loose JSON object type. */
export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Luogu's marker for an un-authenticated request. */
export const UNLOGIN_ERROR = 'LuoguWeb\\Spilopelia\\Exception\\UserUnloginException'

/** Stable, model-facing failure kinds. */
export type LuoguErrorCode =
  | 'NETWORK'
  | 'ABORTED'
  | 'HTTP'
  | 'BAD_PAYLOAD'
  | 'LUOGU_ERROR'
  | 'UNAUTHENTICATED'
  | 'CSRF_UNAVAILABLE'

/** The network / policy failure reported by the tools. */
export class LuoguError extends Error {
  override readonly name = 'LuoguError'
  readonly code: LuoguErrorCode
  constructor(code: LuoguErrorCode, message: string, options?: { cause?: unknown; remote?: string }) {
    super(message, options)
    this.code = code
    if (options?.remote !== undefined) this.remote = options.remote
  }
  remote?: string
}

function originOf(origin?: string): string {
  return (origin ?? LUOGU_ORIGIN).replace(/\/+$/, '')
}

function encodeQuery(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

/** Build an absolute URL for a site path, injecting the content-only JSON query. */
function contentOnlyUrl(path: string, origin: string): string {
  const joiner = path.includes('?') ? '&' : '?'
  return `${origin}${path.startsWith('/') ? path : `/${path}`}${joiner}${encodeQuery(CONTENT_ONLY_QUERY)}`
}

export interface LuoguRequestOptions {
  /** Full cookie header value (may be empty for anonymous reads). */
  cookie?: string | undefined
  /** HTTP User-Agent. */
  userAgent?: string | undefined
  /** CSRF token to attach to a non-GET request (cached by caller). */
  csrfToken?: string | undefined
  origin?: string | undefined
  signal?: AbortSignal | undefined
}

/**
 * Send one request to a Luogu site URL and return the raw parsed JSON envelope.
 * `body === undefined` issues GET; otherwise POST with a JSON body. The request
 * always asks for the JSON representation of the page.
 *
 * @throws {LuoguError} on transport failure, non-2xx, or application-level error.
 */
export async function requestJson(
  path: string,
  body: UnknownRecord | undefined,
  options: LuoguRequestOptions = {},
): Promise<unknown> {
  const origin = originOf(options.origin)
  const isGet = body === undefined
  const headers: Record<string, string> = {
    'User-Agent': options.userAgent ?? 'dsh-luogu',
    Referer: `${origin}/`,
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json, text/plain, */*',
    'x-luogu-type': 'content-only',
  }
  if (options.cookie !== undefined && options.cookie.length > 0) {
    headers.Cookie = options.cookie
  }
  const init: RequestInit = { method: isGet ? 'GET' : 'POST', headers }
  if (options.signal !== undefined) init.signal = options.signal
  if (!isGet) {
    if (options.csrfToken !== undefined && options.csrfToken.length > 0) {
      headers['X-CSRF-Token'] = options.csrfToken
    }
    init.body = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(contentOnlyUrl(path, origin), init)
  } catch (cause) {
    if (options.signal?.aborted === true) {
      throw new LuoguError('ABORTED', 'request to Luogu was aborted', { cause })
    }
    throw new LuoguError('NETWORK', `Luogu network request failed: ${String(cause)}`, { cause })
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text.length === 0 ? null : JSON.parse(text)
  } catch {
    if (!response.ok) {
      throw new LuoguError('HTTP', `Luogu request failed: HTTP ${response.status}`)
    }
    throw new LuoguError('BAD_PAYLOAD', `Luogu returned non-JSON (HTTP ${response.status})`)
  }

  const remote = parsed !== undefined ? extractErrorMessage(parsed) : undefined
  if (!response.ok) {
    throw new LuoguError('HTTP', `Luogu request failed: ${remote ?? `HTTP ${response.status}`}`, {
      remote,
    })
  }
  if (remote !== undefined) {
    const code: LuoguErrorCode = isUnlogin(remote) ? 'UNAUTHENTICATED' : 'LUOGU_ERROR'
    throw new LuoguError(code, `Luogu error: ${remote}`, { remote })
  }
  return parsed
}

function isUnlogin(message: string): boolean {
  return message.includes(UNLOGIN_ERROR) || message.includes('未登录') || message.includes('not logged in')
}

/**
 * Fetch a rendered Luogu page and extract its CSRF token from `<head>`. The
 * token is required on every non-GET (submit) call. vscode-luogu fetches it
 * once from `/ranking` and reuses it; callers cache and refresh on failure.
 */
export async function fetchCsrfToken(
  options: { cookie?: string; userAgent?: string; origin?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const origin = originOf(options.origin)
  const headers: Record<string, string> = {
    'User-Agent': options.userAgent ?? 'dsh-luogu',
    Accept: 'text/html',
  }
  if (options.cookie !== undefined && options.cookie.length > 0) headers.Cookie = options.cookie
  const init: RequestInit = { method: 'GET', headers }
  if (options.signal !== undefined) init.signal = options.signal
  const response = await fetch(`${origin}${ENDPOINTS.csrfToken}`, init)
  const html = await response.text()
  const match = CSRF_TOKEN_REGEX.exec(html)
  const token = match?.[1]
  if (token === undefined) {
    throw new LuoguError('CSRF_UNAVAILABLE', 'Could not read the CSRF token from the Luogu page')
  }
  return token
}

/**
 * Decode the leaf object from either response envelope. Returns the object
 * under Lentille `data` or legacy `currentData`, whichever is a record.
 */
export function dataOf(response: unknown): UnknownRecord | undefined {
  if (!isRecord(response)) return undefined
  if (isRecord(response['data'])) return response['data'] as UnknownRecord
  if (isRecord(response['currentData'])) return response['currentData'] as UnknownRecord
  return undefined
}

/** Pull a remote errorMessage from the top level or currentData/data. */
export function extractErrorMessage(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined
  for (const key of ['errorMessage', 'message']) {
    const value = response[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  for (const holder of ['currentData', 'data']) {
    const section = response[holder]
    if (isRecord(section) && typeof section['errorMessage'] === 'string') {
      return section['errorMessage']
    }
  }
  return undefined
}

/** Safe number reader. */
export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Safe string reader. */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
