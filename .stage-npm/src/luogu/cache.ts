/**
 * Tiny JSON file cache for fetched problem details ("题目离线查看").
 *
 * Each successful `luogu_problem` fetch writes the normalized problem detail to
 * a per-pid JSON file under a cache directory, keyed by pid. A later read with
 * `refresh: false` (the default for offline reuse) returns the cached detail
 * when present. This makes a problem readable on a flaky/offline network.
 *
 * The cache lives under a user-chosen `cacheDir` (settings `luogu.cacheDir`, or
 * the default OS user cache directory). Write errors are non-fatal: a tool
 * still returns the fresh result if caching fails.
 * @module
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import type { LuoguProblemDetailResult } from '../luogu-types.ts'

export interface CacheEntry {
  cachedAt: number
  detail: LuoguProblemDetailResult
}

const CACHE_VERSION = 1

function defaultCacheDir(): string {
  const platform = os.platform()
  const home = os.homedir()
  if (platform === 'win32') return join(home, 'AppData', 'Local', 'dsh-luogu', 'cache')
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'dsh-luogu')
  return join(process.env.XDG_CACHE_HOME ?? join(home, '.cache'), 'dsh-luogu')
}

/** Escape a pid for safe use as a filename. */
function fileNameFor(pid: string): string {
  return `${pid.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`
}

export interface ProblemCache {
  readonly dir: string
  read(pid: string): Promise<LuoguProblemDetailResult | undefined>
  write(pid: string, detail: LuoguProblemDetailResult): Promise<void>
}

/**
 * Build a problem cache rooted at `cacheDir`, or `undefined` when caching is
 * disabled (`enabled: false`).
 */
export function problemCache(options: { enabled: boolean; cacheDir?: string | undefined }): ProblemCache | undefined {
  if (!options.enabled) return undefined
  const dir = options.cacheDir === undefined || options.cacheDir.trim().length === 0
    ? defaultCacheDir()
    : options.cacheDir
  return {
    dir,
    async read(pid) {
      try {
        const raw = await readFile(join(dir, fileNameFor(pid)), 'utf8')
        const parsed = JSON.parse(raw) as Partial<CacheEntry>
        if (parsed === null || typeof parsed !== 'object' || parsed.cachedAt === undefined) return undefined
        if (parsed.detail === undefined) return undefined
        return parsed.detail
      } catch {
        return undefined
      }
    },
    async write(pid, detail) {
      try {
        await mkdir(dir, { recursive: true })
        const entry: CacheEntry = { cachedAt: Date.now(), detail }
        await writeFile(join(dir, fileNameFor(pid)), JSON.stringify({ ...entry, version: CACHE_VERSION }), 'utf8')
      } catch {
        // Best-effort caching: never fail the read tool because the cache
        // directory is not writable.
      }
    },
  }
}
