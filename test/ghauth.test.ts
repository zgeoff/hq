import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { goalsDailyCheck } from '../src/goals/daily/goals-daily-check.ts';
import { clearGhAuth } from '../src/ghauth/clear-gh-auth.ts';
import { ghAuthCause } from '../src/ghauth/gh-auth-cause.ts';
import { noteGhAuth } from '../src/ghauth/note-gh-auth.ts';
import { sydneyUtc } from '../src/morning/sydney-utc.ts';
import { cleanEnv } from '../src/runner/clean-env.ts';
import { at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at('2026-10-17T05:00:00Z');
});
afterEach(() => cleanup());

test('cleanEnv drops a GITHUB_TOKEN or GH_TOKEN not shaped like a GitHub token, and keeps a real-shaped one', () => {
  const saved = { g: process.env['GITHUB_TOKEN'], h: process.env['GH_TOKEN'] };
  try {
    process.env['GITHUB_TOKEN'] = '$(gh auth token)';
    process.env['GH_TOKEN'] = '';
    let env = cleanEnv();
    expect('GITHUB_TOKEN' in env).toBe(false);
    expect('GH_TOKEN' in env).toBe(false);
    process.env['GITHUB_TOKEN'] = `gho_${'k'.repeat(36)}`;
    process.env['GH_TOKEN'] = `github_pat_${'k'.repeat(40)}`;
    env = cleanEnv();
    expect(env['GITHUB_TOKEN']).toBe(`gho_${'k'.repeat(36)}`);
    expect(env['GH_TOKEN']).toBe(`github_pat_${'k'.repeat(40)}`);
    expect('GITHUB_TOKEN' in cleanEnv({ GITHUB_TOKEN: 'not a token' })).toBe(false);
  } finally {
    for (const [k, v] of [['GITHUB_TOKEN', saved.g], ['GH_TOKEN', saved.h]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('a 401 from gh is noted with its start time; other failures are not; a working call clears it', () => {
  noteGhAuth(db, 'gh repo list failed (1): could not resolve host');
  expect(ghAuthCause(db)).toBeNull();
  noteGhAuth(db, 'gh repo list failed (1): HTTP 401: Bad credentials (https://api.github.com/graphql)');
  at('2026-10-17T06:00:00Z');
  noteGhAuth(db, 'gh search prs failed (1): non-200 OK status code: 401 Unauthorized');
  expect(ghAuthCause(db)).toStartWith("GitHub auth failed (401) for hq's gh calls since 2026-10-17T05:00:00Z");
  clearGhAuth(db);
  expect(ghAuthCause(db)).toBeNull();
});

test('hq health names the 401 as the cause of a missed goals check-in', () => {
  const late = sydneyUtc(2026, 10, 17, 18, 45);
  expect(goalsDailyCheck(db, late)!.line).toBe('goals check-in: no run today (2026-10-17); due 18:00 Sydney');
  noteGhAuth(db, 'HTTP 401: Bad credentials');
  expect(goalsDailyCheck(db, late)!.line).toContain("no run today (2026-10-17); due 18:00 Sydney; cause: GitHub auth failed (401) for hq's gh calls since");
});

test('the install build reads no .env or bunfig.toml from the working directory', () => {
  const sh = readFileSync(`${import.meta.dir}/../scripts/install.sh`, 'utf8');
  expect(sh).toContain('--no-compile-autoload-dotenv');
  expect(sh).toContain('--no-compile-autoload-bunfig');
});

// Committed hostile inputs for the token filter: each must be dropped, so gh falls back to its login.
const NOT_TOKENS = ['$(gh auth token)', '`gh auth token`', '${GH_TOKEN}', '', ' ', 'gho_', 'gho_short', `gho_${'k'.repeat(36)} `, `gho_${'k'.repeat(30)};rm`, 'ghx_' + 'k'.repeat(36), 'github_pat_', 'Bearer gho_' + 'k'.repeat(36), "'gho_" + 'k'.repeat(36) + "'"];

test('every hostile token value in the table is dropped from both variables', () => {
  for (const v of NOT_TOKENS) {
    const env = cleanEnv({ GITHUB_TOKEN: v, GH_TOKEN: v });
    expect([v, 'GITHUB_TOKEN' in env, 'GH_TOKEN' in env]).toEqual([v, false, false]);
  }
});
