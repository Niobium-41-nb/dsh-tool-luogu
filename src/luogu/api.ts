/**
 * Typed Luogu API operations for the problem-solving tools.
 *
 * Each function decodes the dual legacy/Lentille envelope into the leaf types
 * declared in {@link src/luogu-types}. A shared client carries the resolved
 * credential, the site origin, the UA, an abort signal, and lazily-fetched
 * CSRF tokens so submit works with the same single-token scheme vscode-luogu
 * uses (token fetched from `/ranking`, refreshed on failure).
 * @module
 */

import { ENDPOINTS } from './constants.ts'
import {
  LuoguError,
  asNumber,
  asString,
  dataOf,
  fetchCsrfToken,
  isRecord,
  requestJson,
  type UnknownRecord,
} from './http.ts'
import type { LuoguCredential } from './auth.ts'
import type {
  LuoguProblemDetailResult,
  LuoguProblemListResult,
  LuoguRecordDetail,
  LuoguRecordListResult,
  LuoguSubmitResult,
  LuoguSubtask,
} from '../luogu-types.ts'

export interface LuoguClientOptions {
  credential: LuoguCredential
  userAgent?: string | undefined
  origin?: string | undefined
  signal?: AbortSignal | undefined
}

export class LuoguClient {
  readonly credential: LuoguCredential
  private readonly userAgent: string
  private readonly origin?: string | undefined
  private readonly signal?: AbortSignal | undefined
  private csrfToken?: string | undefined

  constructor(options: LuoguClientOptions) {
    this.credential = options.credential
    this.userAgent = options.userAgent ?? 'dsh-luogu'
    this.origin = options.origin
    this.signal = options.signal
  }

  /**
   * Read the cookie header to attach to requests: the configured cookie, or
   * `undefined` for anonymous reads. This plugin never mints or refreshes
   * accounts itself.
   */
  async cookieHeader(): Promise<string | undefined> {
    return this.credential.cookie.length === 0 ? undefined : this.credential.cookie
  }

  private async csrf(): Promise<string> {
    if (this.csrfToken === undefined || this.csrfToken.length === 0) {
      this.csrfToken = await fetchCsrfToken({
        cookie: this.credential.cookie.length === 0 ? undefined : this.credential.cookie,
        userAgent: this.userAgent,
        origin: this.origin,
        signal: this.signal,
      })
    }
    return this.csrfToken
  }

  /**
   * Problem list (browse + search + random source). See {@link ListProblemsParams}.
   */
  async listProblems(params: ListProblemsParams): Promise<LuoguProblemListResult> {
    const query: Record<string, string | number> = { page: params.page ?? 1 }
    if (params.keyword !== undefined && params.keyword.length > 0) query['keyword'] = params.keyword
    if (params.type !== undefined && params.type.length > 0) query['type'] = params.type
    if (params.difficulty !== undefined) query['difficulty'] = params.difficulty
    if (params.tag !== undefined && params.tag.length > 0) query['tag'] = params.tag
    if (params.orderBy !== undefined && params.orderBy.length > 0) query['orderBy'] = params.orderBy
    if (params.order !== undefined && params.order.length > 0) query['order'] = params.order
    const path = `${ENDPOINTS.problemList}?${new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)]),
    ).toString()}`
    const payload = await requestJson(path, undefined, {
      cookie: await this.cookieHeader(),
      userAgent: this.userAgent,
      origin: this.origin,
      signal: this.signal,
    })
    return decodeProblemList(payload)
  }

  /** Fetch a single problem's detail. */
  async problemDetail(pid: string): Promise<LuoguProblemDetailResult> {
    const path = `${ENDPOINTS.problem}/${encodeURIComponent(pid)}`
    const payload = await requestJson(path, undefined, {
      cookie: await this.cookieHeader(),
      userAgent: this.userAgent,
      origin: this.origin,
      signal: this.signal,
    })
    return decodeProblemDetail(payload)
  }

  /** Submit code; returns the created record id. */
  async submit(pid: string, body: { code: string; lang: number; enableO2?: boolean }): Promise<LuoguSubmitResult> {
    const csrfToken = await this.csrf()
    const submitBody: UnknownRecord = {
      code: body.code,
      lang: body.lang,
      enableO2: body.enableO2 === true ? 1 : 0,
    }
    const payload = await requestJson(
      `${ENDPOINTS.submit}/${encodeURIComponent(pid)}`,
      submitBody,
      {
        cookie: await this.cookieHeader(),
        userAgent: this.userAgent,
        origin: this.origin,
        signal: this.signal,
        csrfToken,
      },
    )
    if (isRecord(payload)) {
      const rid = asNumber(payload['rid'])
      if (rid !== undefined) return { rid }
    }
    // Some servers nest the id under data/currentData.
    const nested = dataOf(payload)
    if (nested !== undefined) {
      const rid = asNumber(nested['rid'])
      if (rid !== undefined) return { rid }
    }
    throw new LuoguError('BAD_PAYLOAD', 'Luogu submit did not return a record id (rid)')
  }

  /** Current user's submission records (pass the configured uid). */
  async recordList(params: RecordListParams): Promise<LuoguRecordListResult> {
    if (params.uid === undefined || params.uid.length === 0) {
      throw new LuoguError('UNAUTHENTICATED', 'record list requires a uid of the logged-in user')
    }
    const query: Record<string, string | number> = { user: params.uid }
    if (params.page !== undefined && params.page > 1) query['page'] = params.page
    if (params.status !== undefined) query['status'] = params.status
    const path = `${ENDPOINTS.recordList}?${new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)]),
    ).toString()}`
    const payload = await requestJson(path, undefined, {
      cookie: await this.cookieHeader(),
      userAgent: this.userAgent,
      origin: this.origin,
      signal: this.signal,
    })
    return decodeRecordList(payload)
  }

  /** Single record detail (result of one submission). */
  async recordDetail(rid: number): Promise<LuoguRecordDetail> {
    const payload = await requestJson(
      `${ENDPOINTS.record}/${rid}`,
      undefined,
      {
        cookie: await this.cookieHeader(),
        userAgent: this.userAgent,
        origin: this.origin,
        signal: this.signal,
      },
    )
    return decodeRecordDetail(payload)
  }
}

export interface ListProblemsParams {
  page?: number | undefined
  /** Keyword searched against problem titles/ids (content search optional). */
  keyword?: string | undefined
  /** Source prefix: P / CF / SP / AT / UVA / B / … */
  type?: string | undefined
  /** Difficulty scale 0..8. */
  difficulty?: number | undefined
  /** Comma-separated tag ids. */
  tag?: string | undefined
  orderBy?: string | undefined
  order?: string | undefined
}

export interface RecordListParams {
  uid?: string | undefined
  page?: number | undefined
  status?: number | undefined
}

/** Random id helpers shared by tools. */

/** Pick a uniformly random problem from a filtered pool. */
export async function randomProblem(
  client: LuoguClient,
  filter: { type?: string | undefined; difficulty?: number | undefined; keyword?: string | undefined; tag?: string | undefined },
): Promise<{ pid: string; name: string; type: string; difficulty: number | null; index: number; count: number }> {
  // Ask for a large page to estimate the count, then sample one item.
  const first = await client.listProblems({ ...filter, page: 1 })
  const count = first.count
  if (count === 0) {
    throw new LuoguError('NOT_FOUND', 'no Luogu problem matches the given filter for a random pick')
  }
  const target = pickRandomIndex(count)
  const pageSize = Math.min(count, 100)
  const page = Math.min(Math.max(1, Math.ceil(target / pageSize)), Math.ceil(count / pageSize))
  const list = await client.listProblems({ ...filter, page })
  const problems = list.problems
  const item = problems[(target - 1) % pageSize]
  if (item === undefined) {
    throw new LuoguError('NOT_FOUND', 'random pick returned no problem')
  }
  return {
    pid: item.pid,
    name: item.name,
    type: item.type,
    difficulty: item.difficulty,
    index: target,
    count,
  }
}

function pickRandomIndex(count: number): number {
  // Uniform over [1, count].
  return 1 + Math.floor(Math.random() * count)
}

/* ------------------------------------------------------------------ */
/* Decoders                                                            */
/* ------------------------------------------------------------------ */

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return false
}

/**
 * Yield candidate leaf containers for a payload in preference order. Luogu has
 * served at least these shapes over time:
 *   `{ data: { problems|record|problem ... } }`         (Lentille, shallow)
 *   `{ data: { data: { problem ... } } }`               (Lentille, nested)
 *   `{ currentData: { problems|record|problem ... } }`  (legacy, shallow)
 * This walks payload, then each envelope's `data`/`currentData`, and also the
 * nested `data`/`currentData` one level further down, yielding unique records.
 */
function* candidateContainers(payload: unknown): Generator<UnknownRecord> {
  const seen = new Set<object>()
  const candidates: UnknownRecord[] = []
  const add = (value: unknown): void => {
    if (!isRecord(value) || seen.has(value)) return
    seen.add(value)
    candidates.push(value)
  }
  add(payload)
  if (isRecord(payload)) {
    add(payload['data'])
    add(payload['currentData'])
    for (const holderName of ['data', 'currentData']) {
      const holder = isRecord(payload[holderName]) ? payload[holderName] : undefined
      if (holder !== undefined) {
        add(holder['data'])
        add(holder['currentData'])
      }
    }
  }
  for (const candidate of candidates) yield candidate
}

/** Find the candidate container that has a given key (value is a record). */
function containerWith(payload: unknown, key: string): UnknownRecord | undefined {
  for (const container of candidateContainers(payload)) {
    if (isRecord(container[key])) return container
  }
  return undefined
}

function decodeProblemList(payload: unknown): LuoguProblemListResult {
  const problemsSection = containerWith(payload, 'problems') ?? undefined
  const problems = problemsSection === undefined ? undefined : problemsSection['problems']
  let list: unknown
  if (Array.isArray(problems)) {
    list = problems
  } else if (isRecord(problems) && Array.isArray(problems['result'])) {
    // Lentille list shape: data.problems = { count, perPage, result: [...] }
    list = problems['result']
  }
  if (!Array.isArray(list)) {
    throw new LuoguError('BAD_PAYLOAD', 'problem list response lacked a problems array')
  }
  const result: LuoguProblemListResult = {
    problems: list.flatMap((row) => {
      if (!isRecord(row)) return []
      const pid = asString(row['pid'])
      if (pid === undefined) return []
      const type = asString(row['type']) ?? ''
      const name = asString(row['name']) ?? ''
      const diff = asNumber(row['difficulty'])
      return [{
        pid,
        type,
        name,
        difficulty: diff === undefined ? null : diff,
        tags: Array.isArray(row['tags']) ? row['tags'].filter((t): t is number => typeof t === 'number') : [],
        totalSubmit: asNumber(row['totalSubmit']) ?? 0,
        totalAccepted: asNumber(row['totalAccepted']) ?? 0,
        flag: asNumber(row['flag']) ?? 0,
      }]
    }),
    count: asNumber((isRecord(problems) ? problems : problemsSection)?.['count']) ?? list.length,
    perPage: asNumber((isRecord(problems) ? problems : problemsSection)?.['perPage']) ?? list.length,
  }
  return result
}

function decodeProblemDetail(payload: unknown): LuoguProblemDetailResult {
  // The container holding the detail is whichever envelope level owns `problem`.
  let problemData: UnknownRecord | undefined
  let problem: UnknownRecord | undefined
  for (const container of candidateContainers(payload)) {
    if (isRecord(container['problem'])) {
      problemData = container
      problem = container['problem']
      break
    }
  }
  // Fall back: last candidate container itself when it looks like a problem.
  if (problem === undefined) {
    for (const container of candidateContainers(payload)) {
      if (asString(container['title']) !== undefined || asString(container['pid']) !== undefined) {
        problemData = container
        problem = container
        break
      }
    }
  }
  if (problem === undefined || problemData === undefined) {
    return { problem: null, bookmarked: false }
  }
  const pid = asString(problem['pid']) ?? ''
  // Lentille names the problem title field `name` (legacy used `title`).
  const title = asString(problem['title']) ?? asString(problem['name']) ?? ''
  if (pid.length === 0 && title.length === 0) {
    return { problem: null, bookmarked: asBoolean(problemData['bookmarked']) }
  }
  const content = isRecord(problem['content']) ? problem['content'] : {}
  const samplesRaw = Array.isArray(problem['samples']) ? problem['samples'] : []
  const limitsRaw = isRecord(problem['limits']) ? problem['limits'] : undefined
  return {
    problem: {
      pid,
      type: asString(problem['type']) ?? '',
      title,
      difficulty: asNumber(problem['difficulty']) ?? null,
      ...asNumber(problem['provider']) === undefined ? {} : { provider: asNumber(problem['provider']) },
      content: {
        background: asString(content['background']) ?? '',
        description: asString(content['description']) ?? '',
        formatI: asString(content['formatI']) ?? '',
        formatO: asString(content['formatO']) ?? '',
        hint: asString(content['hint']) ?? '',
      },
      samples: samplesRaw.flatMap((s) => {
        if (!Array.isArray(s)) return []
        const [input, output] = s
        if (typeof input !== 'string' || typeof output !== 'string') return []
        return [{ input, output }]
      }),
      ...limitsRaw === undefined ? {} : {
        limits: {
          time: Array.isArray(limitsRaw['time']) ? limitsRaw['time'].filter((n): n is number => typeof n === 'number') : [],
          memory: Array.isArray(limitsRaw['memory']) ? limitsRaw['memory'].filter((n): n is number => typeof n === 'number') : [],
        },
      },
      ...Array.isArray(problem['acceptLanguages'])
        ? { acceptLanguages: problem['acceptLanguages'].filter((n): n is number => typeof n === 'number') }
        : {},
    },
    bookmarked: asBoolean(problemData['bookmarked']),
  }
}

function decodeRecordList(payload: unknown): LuoguRecordListResult {
  const recordsSection = containerWith(payload, 'records') ?? undefined
  const records = recordsSection === undefined ? undefined : recordsSection['records']
  const list = Array.isArray(records) ? records : undefined
  if (!Array.isArray(list)) {
    throw new LuoguError('BAD_PAYLOAD', 'record list response lacked a records array')
  }
  const result = list.flatMap((row) => {
    if (!isRecord(row)) return []
    const id = asNumber(row['id'])
    if (id === undefined) return []
    const problem = isRecord(row['problem']) ? row['problem'] : undefined
    const user = isRecord(row['user']) ? row['user'] : undefined
    return [{
      id,
      problem: {
        pid: asString(problem?.['pid']) ?? '',
        title: asString(problem?.['title']) ?? '',
        difficulty: asNumber(problem?.['difficulty']) ?? null,
      },
      user: {
        uid: asNumber(user?.['uid']) ?? 0,
        name: asString(user?.['name']) ?? '',
      },
      status: asNumber(row['status']) ?? -1,
      ...asNumber(row['score']) === undefined ? {} : { score: asNumber(row['score']) },
      ...asNumber(row['memory']) === undefined ? {} : { memory: asNumber(row['memory']) },
      ...asNumber(row['time']) === undefined ? {} : { time: asNumber(row['time']) },
      language: asNumber(row['language']) ?? 0,
      submitTime: asNumber(row['submitTime']) ?? 0,
      ...asNumber(row['sourceCodeLength']) === undefined ? {} : { sourceCodeLength: asNumber(row['sourceCodeLength']) },
      enableO2: asBoolean(row['enableO2']),
    }]
  })
  return {
    records: result,
    count: asNumber(recordsSection?.['count']) ?? list.length,
    perPage: asNumber(recordsSection?.['perPage']) ?? list.length,
  }
}

function decodeRecordDetail(payload: unknown): LuoguRecordDetail {
  // The record may be at any container depth, nested under `record` or exposed
  // directly. Try containers that own a `record`, else the deepest-looking one.
  let record: UnknownRecord | undefined
  for (const container of candidateContainers(payload)) {
    const nested = isRecord(container['record']) ? container['record'] : undefined
    if (nested !== undefined && asNumber(nested['id']) !== undefined) {
      record = nested
      break
    }
  }
  if (record === undefined) {
    for (const container of candidateContainers(payload)) {
      if (asNumber(container['id']) !== undefined) {
        record = container
        break
      }
    }
  }
  if (record === undefined) {
    throw new LuoguError('BAD_PAYLOAD', 'single record response lacked a record with an id')
  }
  const problem = isRecord(record['problem']) ? record['problem'] : undefined
  const user = isRecord(record['user']) ? record['user'] : undefined
  return {
    id: asNumber(record['id']) ?? 0,
    problem: {
      pid: asString(problem?.['pid']) ?? '',
      title: asString(problem?.['title']) ?? '',
    },
    user: {
      uid: asNumber(user?.['uid']) ?? 0,
      name: asString(user?.['name']) ?? '',
    },
    status: asNumber(record['status']) ?? -1,
    ...asNumber(record['score']) === undefined ? {} : { score: asNumber(record['score']) },
    ...asNumber(record['memory']) === undefined ? {} : { memory: asNumber(record['memory']) },
    ...asNumber(record['time']) === undefined ? {} : { time: asNumber(record['time']) },
    language: asNumber(record['language']) ?? 0,
    submitTime: asNumber(record['submitTime']) ?? 0,
    enableO2: asBoolean(record['enableO2']),
    ...asString(record['sourceCode']) === undefined ? {} : { sourceCode: asString(record['sourceCode']) },
    ...decodeCompileResult(record) === undefined ? {} : { compileResult: decodeCompileResult(record) },
    ...Array.isArray(record['testCaseGroup'])
      ? { testCaseGroup: (record['testCaseGroup'] as unknown[]).flatMap(decodeSubtasks) }
      : {},
    raw: record,
  }
}

function decodeCompileResult(record: UnknownRecord): LuoguRecordDetail['compileResult'] {
  const detail = record['detail']
  if (!isRecord(detail) || !isRecord(detail['compileResult'])) return undefined
  const compile = detail['compileResult']
  return {
    ...asBoolean(compile['success']) === undefined ? {} : { success: asBoolean(compile['success']) },
    ...asString(compile['message']) === undefined ? {} : { message: asString(compile['message']) },
  }
}

function decodeSubtasks(subtask: unknown): LuoguSubtask[] {
  if (!isRecord(subtask)) return []
  const testsRaw = subtask['testCases']
  if (!Array.isArray(testsRaw)) return []
  const id = asNumber(subtask['id'])
  if (id === undefined) return []
  return [{
    id,
    ...asNumber(subtask['score']) === undefined ? {} : { score: asNumber(subtask['score']) },
    ...asNumber(subtask['status']) === undefined ? {} : { status: asNumber(subtask['status']) },
    testCases: testsRaw.flatMap((t) => {
      if (!isRecord(t)) return []
      const tid = asNumber(t['id'])
      if (tid === undefined) return []
      return [{
        id: tid,
        status: asNumber(t['status']) ?? -1,
        time: asNumber(t['time']) ?? 0,
        memory: asNumber(t['memory']) ?? 0,
        score: asNumber(t['score']) ?? 0,
        ...asNumber(t['signal']) === undefined ? {} : { signal: asNumber(t['signal']) },
        ...asNumber(t['subtaskId']) === undefined ? {} : { subtaskId: asNumber(t['subtaskId']) },
      }]
    }),
  }]
}

