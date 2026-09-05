/**
 * Domain types for the Luogu problem-solving tools.
 *
 * These mirror the shapes vscode-luogu and the official website read from
 * Luogu's private JSON endpoints. Luogu returns two response envelopes: the
 * legacy `{ code, currentData }` and the newer Lentille
 * `{ status, data, locale, time, user }`. Parsers in {@link src/luogu/http}
 * normalize both into the leaf types declared here. Only the leaf fields the
 * tools actually surface are declared; unknown extra fields are ignored by the
 * parsers.
 * @module
 */

/** Difficulty scale used by Luogu's problem list filter. */
export const DIFFICULTY = {
  /** 未评定 (not rated yet). */
  0: 'Not rated',
  /** 入门. */
  1: 'Entry',
  /** 普及- . */
  2: 'Popular-',
  /** 普及/提高- . */
  3: 'Popular',
  /** 普及+/提高. */
  4: 'Popular+/Improve-',
  /** 提高+/省选-. */
  5: 'Improve',
  /** 省选/NOI-. */
  6: 'Improve+/Provincial-',
  /** 提高+/省选- . */
  7: 'Provincial/NOI-',
  /** 省选/NOI/NOI+/CTS. */
  8: 'NOI',
} as const

export type Difficulty = keyof typeof DIFFICULTY

/** Problem source prefix, from the problemset (`P`/`CF`/`SP`/`AT`/`UVA`/…). */
export const PROBLEM_TYPE = {
  B: 'B',
  P: 'P',
  CF: 'CF',
  SP: 'SP',
  AT: 'AT',
  UVA: 'UVA',
} as const

/** One row returned by the problem list endpoint. */
export interface LuoguProblemRow {
  /** Problem id, e.g. `P1001` or `CF1A`. */
  pid: string
  /** Source prefix, e.g. `P` / `CF`. */
  type: string
  /** Human title. */
  name: string
  /** Difficulty scale 0..8; absent or `null` when unrated. */
  difficulty: number | null
  /** Tag ids. */
  tags: number[]
  totalSubmit: number
  totalAccepted: number
  /** Whether the user (when authenticated) passed it. */
  flag: number
}

/** Paged problem list payload normalized by the parser. */
export interface LuoguProblemListResult {
  problems: LuoguProblemRow[]
  count: number
  perPage: number
}

/** Problem detail leaf fields surfaced by {@link luogu_problem}. */
export interface LuoguProblemContent {
  /** Markdown problem background, empty when none. */
  background: string
  /** Markdown statement. */
  description: string
  /** Markdown input format description. */
  formatI: string
  /** Markdown output format description. */
  formatO: string
  /** Markdown hint, empty when none. */
  hint: string
}

export interface LuoguSample {
  input: string
  output: string
}

export interface LuoguProblemLimits {
  time: number[]
  memory: number[]
}

export interface LuoguProblemDetails {
  pid: string
  type: string
  title: string
  difficulty: number | null
  /** Provider user id. */
  provider?: number
  content: LuoguProblemContent
  samples: LuoguSample[]
  limits?: LuoguProblemLimits
  /** Submitted code languages accepted for this problem. */
  acceptLanguages?: number[]
}

/** Single problem detail payload normalized by the parser. */
export interface LuoguProblemDetailResult {
  problem: LuoguProblemDetails | null
  bookmarked: boolean
}

/** Normalized submission record base row (from the record list endpoint). */
export interface LuoguRecordRow {
  /** Submission id (rid). */
  id: number
  problem: { pid: string; title: string; difficulty: number | null }
  user: { uid: number; name: string }
  status: number
  score?: number
  memory?: number
  time?: number
  language: number
  submitTime: number
  sourceCodeLength?: number
  enableO2: boolean
}

/** Paged record list payload normalized by the parser. */
export interface LuoguRecordListResult {
  records: LuoguRecordRow[]
  count: number
  perPage: number
}

/** One test-case level of the judgement detail. */
export interface LuoguTestCase {
  id: number
  status: number
  time: number
  memory: number
  score: number
  signal?: number
  inputFile?: string
  outputFile?: string
  subtaskId?: number
}

/** One subtask group of the judgement detail. */
export interface LuoguSubtask {
  id: number
  score?: number
  status?: number
  testCases: LuoguTestCase[]
}

/** Compile-output detail of a single record. */
export interface LuoguCompileResult {
  success?: boolean
  message?: string
}

/** Full single-record payload normalized by the parser. */
export interface LuoguRecordDetail {
  id: number
  problem: { pid: string; title: string }
  user: { uid: number; name: string }
  status: number
  score?: number
  memory?: number
  time?: number
  language: number
  submitTime: number
  enableO2: boolean
  sourceCode?: string
  compileResult?: LuoguCompileResult
  testCaseGroup?: LuoguSubtask[]
  /** Raw detail object kept for lossless passthrough when the parser is unsure. */
  raw?: Record<string, unknown>
}

/** Result of a submit call: the created record id. */
export interface LuoguSubmitResult {
  rid: number
}
