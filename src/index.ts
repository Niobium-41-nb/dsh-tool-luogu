/**
 * DSH tool plugin: Luogu problem-solving loop for the agent.
 *
 * Registers model-callable tools on `ctx.tools` for browsing/searching the
 * Luogu problem set, reading a problem (with an offline cache), picking a
 * random problem by source/difficulty, submitting code, and inspecting the
 * user's submissions / a single result.
 *
 * Auth model: the plugin never logs in or out. It reads a user-configured
 * cookie under the `luogu` settings namespace (or the `LUOGU_COOKIE`
 * environment variable). There is deliberately NO logout tool.
 *
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LuoguClient as LuoguClientImpl } from './luogu/api.ts'
import type { LuoguClient } from './luogu/api.ts'
import { DIFFICULTY, LANGUAGES, LUOGU_ORIGIN, VERDICTS } from './luogu/constants.ts'
import type { LuoguCredential } from './luogu/auth.ts'
import { resolveCredential } from './luogu/auth.ts'
import { problemCache } from './luogu/cache.ts'
import type { LuoguProblemDetailResult } from './luogu-types.ts'

/** Cordis plugin name shown in loader diagnostics. */
export const name = 'tool-luogu'

/** Services this plugin registers into. */
export const inject = ['tools']

/** Settings namespace carrying the user's Luogu login cookie + preferences. */
export const LUOGU_SETTINGS_NAMESPACE = 'luogu'

/** Resolved user-facing plugin configuration. */
export interface Config {
  /** Luogu site origin. */
  origin?: string
  /** Full login cookie (secret). Prefer the settings namespace / env var. */
  cookie?: string
  /** Environment variable name holding the cookie; default `LUOGU_COOKIE`. */
  cookieEnv?: string
  /** User id, used to list own submissions when not derivable from the cookie. */
  uid?: string
  /** Client id used alongside `uid` when only that pair is configured. */
  clientId?: string
  /** HTTP User-Agent sent to Luogu. */
  userAgent?: string
  /** Whether to cache fetched problem details for offline reading. */
  cacheEnabled?: boolean
  /** Directory for the offline problem cache. */
  cacheDir?: string
}

/** Schemastery schema for the luogu plugin config / settings namespace. */
export const Config: z<Config> = z.object({
  origin: z.string().default(LUOGU_ORIGIN),
  cookie: z.string().role('secret'),
  cookieEnv: z.string().role('credential-ref').default('LUOGU_COOKIE'),
  uid: z.string(),
  clientId: z.string(),
  userAgent: z.string().default('dsh-luogu'),
  cacheEnabled: z.boolean().default(true),
  cacheDir: z.string(),
})

const DIFFICULTY_ENUM = Object.keys(DIFFICULTY).map(Number).filter((n) => n >= 0)

/** Integer difficulty or `undefined` (unrated) -> label. */
function difficultyName(value: number | undefined | null): string {
  if (value === undefined || value === null) return 'Not rated'
  return DIFFICULTY[value as keyof typeof DIFFICULTY] ?? `Difficulty ${String(value)}`
}

function verdictName(status: number): string {
  return VERDICTS[status] ?? `Status ${String(status)}`
}

function languageName(lang: number): string {
  return LANGUAGES[lang] ?? `lang ${String(lang)}`
}

function isoOf(unixSeconds: number | undefined): string {
  return unixSeconds !== undefined && unixSeconds > 0
    ? new Date(unixSeconds * 1000).toISOString()
    : ''
}

/* ------------------------------------------------------------------ */
/* Model-facing view shapes (shared by tools and tool-todo-style DSL) */
/* ------------------------------------------------------------------ */

interface ProblemRowView {
  pid: string
  type: string
  name: string
  difficulty?: number
  difficultyName: string
  tags: number[]
  totalSubmit: number
  totalAccepted: number
}

interface ProblemView {
  pid: string
  type: string
  title: string
  difficulty?: number
  difficultyName: string
  background: string
  description: string
  formatI: string
  formatO: string
  hint: string
  samples: { input: string; output: string }[]
  limits?: { time: number[]; memory: number[] }
  acceptLanguages?: number[]
  fromCache: boolean
}

/** Registered-tools plugin. */
export function apply(ctx: Context, config: Config): void {
  // Current authoritative section: composition config layered under the user
  // settings document, refreshed live by the settings seam.
  let current: () => Config = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, LUOGU_SETTINGS_NAMESPACE, Config, config, {
      setSource: (source) => {
        current = source
      },
      // Tools resolve the section per call, so a committed change needs no
      // re-registration.
      onChange: () => {},
    })
  })

  function section(): Config {
    return current()
  }

  function credential(): LuoguCredential {
    return resolveCredential(section())
  }

  function newClient(signal?: AbortSignal): LuoguClient {
    const s = section()
    return new LuoguClientImpl({
      credential: credential(),
      userAgent: s.userAgent ?? 'dsh-luogu',
      origin: s.origin,
      signal,
    })
  }

  function cache() {
    const s = section()
    return problemCache({ enabled: s.cacheEnabled ?? true, cacheDir: s.cacheDir })
  }

  /* luogu_problem_list --------------------------------------------------- */
  ctx.tools.register(defineTool({
    name: 'luogu_problem_list',
    description:
      'Browse or search the Luogu (洛谷) problem set. Returns a page of problems with '
      + 'pid, type/source (P/CF/SP/AT/UVA/B…), name, difficulty and acceptance counts. '
      + 'Use keyword for text search; type filters by source; difficulty is the 0..8 scale. '
      + 'Anonymous browsing works without a login.',
    parameters: {
      page: { type: 'integer', description: 'Page number, starting at 1. Default 1.' },
      keyword: { type: 'string', description: 'Optional keyword searched against problem ids and titles.' },
      type: { type: 'string', description: 'Source prefix: P, B, CF, SP, AT, UVA, …; omit for all.' },
      difficulty: {
        type: 'integer',
        enum: [...DIFFICULTY_ENUM],
        description: 'Filter by difficulty: 0 unrated, 1 入门, 2 普及-, 3 普及, 4 普及+/提高-, 5 提高, 6 提高+/省选-, 7 省选/NOI-, 8 NOI. Omit for all.',
      },
      tag: { type: 'string', description: 'Optional comma-separated tag ids to filter by.' },
      orderBy: { type: 'string', description: 'Optional ordering field.' },
      order: { type: 'string', enum: ['asc', 'desc'], description: 'Order direction.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'integer', required: true },
          perPage: { type: 'integer', required: true },
          problems: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                pid: { type: 'string', required: true },
                type: { type: 'string', required: true },
                name: { type: 'string', required: true },
                difficulty: { type: 'integer' },
                difficultyName: { type: 'string', required: true },
                tags: { type: 'array', items: { type: 'integer' } },
                totalSubmit: { type: 'integer', required: true },
                totalAccepted: { type: 'integer', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Luogu problem list: ${String(value.count)} total, showing page of ${String((value as { problems: unknown[] }).problems.length)}.`,
      }],
    },
    async execute(args, exec) {
      const client = newClient(exec.signal)
      const result = await client.listProblems({
        page: args.page ?? 1,
        keyword: args.keyword,
        type: args.type,
        difficulty: args.difficulty,
        tag: args.tag,
        orderBy: args.orderBy,
        order: args.order,
      })
      return {
        count: result.count,
        perPage: result.perPage,
        problems: result.problems.map<ProblemRowView>((r) => ({
          pid: r.pid,
          type: r.type,
          name: r.name,
          ...r.difficulty === null || r.difficulty === undefined ? {} : { difficulty: r.difficulty },
          difficultyName: difficultyName(r.difficulty),
          tags: r.tags,
          totalSubmit: r.totalSubmit,
          totalAccepted: r.totalAccepted,
        })),
      }
    },
    presentCall: () => ({ card: 'generic', title: 'List Luogu problems', kind: 'search' }),
  }))

  /* luogu_problem --------------------------------------------------------- */
  ctx.tools.register(defineTool({
    name: 'luogu_problem',
    description:
      'Read the full statement of one Luogu problem by pid (e.g. P1001, CF1A). Returns the '
      + 'markdown description, input/output format, samples, limits, difficulty and accepted '
      + 'languages. A fresh fetch is cached per the luogu cache so a repeat/offline read works; '
      + 'set refresh=true to bypass the cache.',
    parameters: {
      pid: { type: 'string', required: true, description: 'Problem id, e.g. P1001.' },
      refresh: { type: 'boolean', description: 'Force a fresh fetch instead of using the offline cache. Default false.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pid: { type: 'string', required: true },
          type: { type: 'string', required: true },
          title: { type: 'string', required: true },
          difficulty: { type: 'integer' },
          difficultyName: { type: 'string', required: true },
          background: { type: 'string' },
          description: { type: 'string', required: true },
          formatI: { type: 'string' },
          formatO: { type: 'string' },
          hint: { type: 'string' },
          samples: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                input: { type: 'string', required: true },
                output: { type: 'string', required: true },
              },
            },
          },
          limits: {
            type: 'object',
            additionalProperties: false,
            properties: {
              time: { type: 'array', items: { type: 'integer' } },
              memory: { type: 'array', items: { type: 'integer' } },
            },
          },
          acceptLanguages: { type: 'array', items: { type: 'integer' } },
          fromCache: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Luogu ${String(value.pid)} (${String(value.type)}): ${String(value.title)} — ${String(value.difficultyName)}${value.fromCache === true ? ' (cached)' : ''}.`,
      }],
    },
    async execute(args, exec) {
      const pid = args.pid.trim()
      if (pid.length === 0) throw new Error('luogu_problem: `pid` must be a non-empty string')
      const store = cache()
      if (args.refresh !== true && store !== undefined) {
        const cached = await store.read(pid)
        if (cached !== undefined && cached.problem !== undefined) {
          return { ...problemView(cached), fromCache: true }
        }
      }
      const client = newClient(exec.signal)
      const detail = await client.problemDetail(pid)
      if (store !== undefined && detail.problem !== undefined) await store.write(pid, detail)
      return { ...problemView(detail), fromCache: false }
    },
    presentCall: (args) => ({ card: 'generic', title: `Read Luogu ${args.pid}`, kind: 'read' }),
  }))

  /* luogu_problem_random -------------------------------------------------- */
  ctx.tools.register(defineTool({
    name: 'luogu_problem_random',
    description:
      'Pick a uniformly random Luogu problem from a filtered pool (the “random jump” feature). '
      + 'Filter by source type and/or difficulty. Returns the chosen pid so the model can then '
      + 'read it with luogu_problem.',
    parameters: {
      type: { type: 'string', description: 'Source prefix to draw from, e.g. P or CF. Omit for the whole pool.' },
      difficulty: { type: 'integer', enum: [...DIFFICULTY_ENUM], description: 'Difficulty scale to draw from (see luogu_problem_list). Omit for all.' },
      keyword: { type: 'string', description: 'Optional keyword to filter the random pool.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pid: { type: 'string', required: true },
          type: { type: 'string', required: true },
          name: { type: 'string', required: true },
          difficulty: { type: 'integer' },
          difficultyName: { type: 'string', required: true },
          poolSize: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Random Luogu problem: ${String(value.pid)} (${String(value.type)}) ${String(value.name)} — one of ${String(value.poolSize)}.`,
      }],
    },
    async execute(args, exec) {
      const client = newClient(exec.signal)
      const pick = await client.randomProblem({
        type: args.type,
        difficulty: args.difficulty,
        keyword: args.keyword,
      })
      return {
        pid: pick.pid,
        type: pick.type,
        name: pick.name,
        ...pick.difficulty === null || pick.difficulty === undefined ? {} : { difficulty: pick.difficulty },
        difficultyName: difficultyName(pick.difficulty),
        poolSize: pick.count,
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Random Luogu problem', kind: 'search' }),
  }))

  /* luogu_submit ------------------------------------------------------------ */
  ctx.tools.register(defineTool({
    name: 'luogu_submit',
    description:
      'Submit a code solution to a Luogu problem and return the created record id (rid). Requires '
      + 'a configured login cookie (user-configured; there is no in-plugin login/logout). Provide '
      + 'the full source `code` and a Luogu `lang` id; common ids: 7 Python3, 12 C++17, 28 C++14 '
      + '(GCC9), 27 C++20, 25 PyPy3.',
    parameters: {
      pid: { type: 'string', required: true, description: 'Target problem id, e.g. P1001.' },
      code: { type: 'string', required: true, description: 'The full source code to submit.' },
      lang: { type: 'integer', required: true, description: 'Luogu language id (see description).' },
      enableO2: { type: 'boolean', description: 'Enable O2 optimization. Default false.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { rid: { type: 'integer', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: `Submitted. Record id: ${String(value.rid)}.` }],
    },
    async execute(args, exec) {
      const cred = credential()
      if (cred.uid === undefined || cred.cookie.length === 0) {
        throw new Error(
          'luogu_submit requires a Luogu login cookie. Configure it under the "luogu" settings '
          + 'namespace or set the LUOGU_COOKIE environment variable (login is user-configured; '
          + 'this plugin does not log you in or out).',
        )
      }
      const client = newClient(exec.signal)
      const pid = args.pid.trim()
      if (pid.length === 0) throw new Error('luogu_submit: `pid` must be a non-empty string')
      if (args.code.trim().length === 0) throw new Error('luogu_submit: `code` must not be empty')
      const result = await client.submit(pid, {
        code: args.code,
        lang: args.lang,
        enableO2: args.enableO2 === true,
      })
      return result
    },
    presentCall: (args) => ({ card: 'generic', title: `Submit Luogu ${args.pid}`, kind: 'other' }),
  }))

  /* luogu_record_list ------------------------------------------------------- */
  ctx.tools.register(defineTool({
    name: 'luogu_record_list',
    description:
      'List the logged-in user’s recent Luogu submissions (“查看自己测评”). Requires a configured '
      + 'login cookie. Each row has the record id, problem, verdict/score and time; read a full '
      + 'result with luogu_record by rid.',
    parameters: {
      page: { type: 'integer', description: 'Page of records, starting at 1.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          uid: { type: 'integer', required: true },
          count: { type: 'integer', required: true },
          perPage: { type: 'integer', required: true },
          records: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rid: { type: 'integer', required: true },
                pid: { type: 'string', required: true },
                title: { type: 'string', required: true },
                status: { type: 'integer', required: true },
                verdict: { type: 'string', required: true },
                score: { type: 'integer' },
                time: { type: 'integer' },
                memory: { type: 'integer' },
                language: { type: 'integer', required: true },
                languageName: { type: 'string', required: true },
                submitTime: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Luogu submissions for uid ${String(value.uid)}: ${String(value.count)} total.`,
      }],
    },
    async execute(args, exec) {
      const cred = credential()
      if (cred.uid === undefined) {
        throw new Error(
          'luogu_record_list needs your Luogu uid (configured under the "luogu" settings or derived '
          + 'from the cookie). Login is user-configured; there is no logout.',
        )
      }
      const client = newClient(exec.signal)
      const result = await client.recordList({ uid: cred.uid, page: args.page })
      return {
        uid: Number(cred.uid),
        count: result.count,
        perPage: result.perPage,
        records: result.records.map((r) => ({
          rid: r.id,
          pid: r.problem.pid,
          title: r.problem.title,
          status: r.status,
          verdict: verdictName(r.status),
          ...r.score === undefined ? {} : { score: r.score },
          ...r.time === undefined ? {} : { time: r.time },
          ...r.memory === undefined ? {} : { memory: r.memory },
          language: r.language,
          languageName: languageName(r.language),
          submitTime: isoOf(r.submitTime),
        })),
      }
    },
    presentCall: () => ({ card: 'generic', title: 'List my Luogu submissions', kind: 'other' }),
  }))

  /* luogu_record ------------------------------------------------------------ */
  ctx.tools.register(defineTool({
    name: 'luogu_record',
    description:
      'Read the full result of one Luogu submission by record id (rid) — verdict, score, time/memory, '
      + 'compile result and per-testcase judgement where available (“查看最近一次评测 / 单次评测详情”).',
    parameters: {
      rid: { type: 'integer', required: true, description: 'Submission/record id returned by luogu_submit or luogu_record_list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rid: { type: 'integer', required: true },
          pid: { type: 'string', required: true },
          title: { type: 'string', required: true },
          status: { type: 'integer', required: true },
          verdict: { type: 'string', required: true },
          score: { type: 'integer' },
          time: { type: 'integer' },
          memory: { type: 'integer' },
          language: { type: 'integer', required: true },
          languageName: { type: 'string', required: true },
          submitTime: { type: 'string', required: true },
          compileMessage: { type: 'string' },
          sourceCode: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Record ${String(value.rid)} on ${String(value.pid)}: ${String(value.verdict)} (score ${String(value.score)})`,
      }],
    },
    async execute(args, exec) {
      const client = newClient(exec.signal)
      const detail = await client.recordDetail(args.rid)
      return {
        rid: detail.id,
        pid: detail.problem.pid,
        title: detail.problem.title,
        status: detail.status,
        verdict: verdictName(detail.status),
        ...detail.score === undefined ? {} : { score: detail.score },
        ...detail.time === undefined ? {} : { time: detail.time },
        ...detail.memory === undefined ? {} : { memory: detail.memory },
        language: detail.language,
        languageName: languageName(detail.language),
        submitTime: isoOf(detail.submitTime),
        ...detail.compileResult?.message === undefined ? {} : { compileMessage: detail.compileResult.message },
        ...detail.sourceCode === undefined ? {} : { sourceCode: detail.sourceCode },
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `Read Luogu record ${args.rid}`, kind: 'read' }),
  }))
}

/** Normalize a problem detail result into the model-facing problem view. */
function problemView(detail: LuoguProblemDetailResult): Omit<ProblemView, 'fromCache'> {
  const p = detail.problem
  if (p === undefined) {
    throw new Error('luogu_problem: the problem was not found (it may be restricted or require a login cookie)')
  }
  return {
    pid: p.pid,
    type: p.type,
    title: p.title,
    ...p.difficulty === null || p.difficulty === undefined ? {} : { difficulty: p.difficulty },
    difficultyName: difficultyName(p.difficulty),
    background: p.content.background,
    description: p.content.description,
    formatI: p.content.formatI,
    formatO: p.content.formatO,
    hint: p.content.hint,
    samples: p.samples.map((s) => ({ input: s.input, output: s.output })),
    ...p.limits === undefined ? {} : { limits: { time: p.limits.time, memory: p.limits.memory } },
    ...p.acceptLanguages === undefined ? {} : { acceptLanguages: p.acceptLanguages },
  }
}
