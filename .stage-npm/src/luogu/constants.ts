/**
 * Luogu private-API constants: request metadata, language ids, verdict codes,
 * and endpoint paths. Luogu treats these as internal and they may change;
 * every web URL keeps working with `_contentOnly=1` or the content-only
 * request header.
 * @module
 */

/** Base origin of the Luogu website. */
export const LUOGU_ORIGIN = 'https://www.luogu.com.cn'

/** Luogu language id -> model-facing name. Only the common set is declared. */
export const LANGUAGES: Record<number, string> = {
  7: 'Python 3',
  8: 'C',
  9: 'C++ 98',
  10: 'C++ 11',
  11: 'C++ 14',
  12: 'C++ 17',
  13: 'C++ 20',
  14: 'C++ 11 (clang)',
  15: 'C++ 14 (clang)',
  16: 'C++ 17 (clang)',
  17: 'C++ 20 (clang)',
  18: 'C++ (NOI)',
  19: 'C (NOI)',
  20: 'Java 8',
  21: 'Java 11',
  22: 'Java 17',
  23: 'Pascal',
  24: 'Node.js 12',
  25: 'PyPy 3',
  26: 'C# 8',
  27: 'C++ 20',
  28: 'C++ 14 (GCC 9)',
  29: 'JavaScript (Node.js)',
  30: 'Go',
  31: 'Ruby',
  32: 'Rust 1.49',
  33: 'C++ 17 (GCC 9)',
  34: 'PHP 7',
  35: 'TypeScript (Node.js)',
  36: 'Kotlin',
  37: 'Zig',
  38: 'Java 8 (Emscripten)',
  39: 'Scala 3',
  40: 'C++ 20 (GCC 12)',
  41: 'C++ 17 (GCC 12)',
  42: 'Pascal (FPC 3.0.4)',
}

/** Verdict status code -> short label, from the official recordStatus config. */
export const VERDICTS: Record<number, string> = {
  [-1]: 'Unshown',
  0: 'Waiting',
  1: 'Judging',
  2: 'Compile Error',
  3: 'Output Limit Exceeded',
  4: 'Memory Limit Exceeded',
  5: 'Time Limit Exceeded',
  6: 'Wrong Answer',
  7: 'Runtime Error',
  11: 'Unknown Error',
  12: 'Accepted',
  14: 'Unaccepted',
  21: 'Hack Success',
  22: 'Hack Failed',
  23: 'Hack Unknown',
}

/** Short verdict codes used when rendering status to the model. */
export const VERDICT_SHORT: Record<number, string> = {
  [-1]: 'Unshown',
  0: 'Waiting',
  1: 'Judging',
  2: 'CE',
  3: 'OLE',
  4: 'MLE',
  5: 'TLE',
  6: 'WA',
  7: 'RE',
  11: 'UKE',
  12: 'AC',
  14: 'Unaccepted',
  21: 'Hack OK',
  22: 'Hack Fail',
  23: 'Hack Unknown',
}

/** Parameter key used to request JSON on the Luogu website. */
export const CONTENT_ONLY_QUERY = { _contentOnly: 1 }

/** Endpoint paths (relative to {@link LUOGU_ORIGIN}). */
export const ENDPOINTS = {
  /** Problem list / search. */
  problemList: '/problem/list',
  /** Single problem detail (real-time, anonymous ok). */
  problem: '/problem',
  /** Submit code. `POST /fe/api/problem/submit/{pid}`. */
  submit: '/fe/api/problem/submit',
  /** Own submission records. */
  recordList: '/record/list',
  /** Single record detail. */
  record: '/record',
  /** HTML page whose `<meta name="csrf-token">` seeds non-GET requests. */
  csrfToken: '/ranking',
  /** Login page used only to mint an anonymous `__client_id`. */
  loginPage: '/auth/login',
  /** Site config exposing the dynamic verdict set. */
  config: '/_lfe/config',
} as const

/**
 * HTML head regex used to read the CSRF token out of a Luogu page. The token
 * is present in every rendered page head; `/ranking` is the page vscode-luogu
 * uses for its single shared token.
 */
export const CSRF_TOKEN_REGEX = /<meta\s+name="csrf-token"\s+content="([^"]+)"\s*\/?>/i

/** Cookie pair Luogu actually honours for API calls: user id + client id. */
export const COOKIE_KEYS = ['_uid', '__client_id', 'uid', 'cliend_id'] as const
