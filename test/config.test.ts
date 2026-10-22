import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { answer } from '../src/atc/answer.ts';
import { AtcClient } from '../src/atc/atc-client.ts';
import { eventsReadSchema } from '../src/atc/events-read-schema.ts';
import { sessionListRequiredSchema } from '../src/atc/session-list-required-schema.ts';
import { sessionListSchema } from '../src/atc/session-list-schema.ts';
import { main } from '../src/cli.ts';
import { config } from '../src/config/config.ts';
import { metaJson } from '../src/db/meta-json.ts';
import { strMap } from '../src/db/str-map.ts';
import { freshDb } from './helpers.ts';
import { startStubAtcDaemon } from './start-stub-atc-daemon.ts';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

// Every setting whose default is a value, with the default hq has always used.
const DEFAULTS: [string, string | number][] = [
  ['HQ_REVIEW_LOCK_WAIT_MS', 300_000],
  ['HQ_LANES_FREE_MIN', 10],
  ['HQ_LANES_REPEAT_MIN', 30],
  ['HQ_LANES_FOLLOW_MIN', 10],
  ['HQ_LANES_READY_FRESH_MIN', 30],
  ['HQ_LANES_READY_ZERO_FRESH_MIN', 180],
  ['HQ_RUN_FINAL_MIN', 30],
  ['HQ_RUN_REVIEW_MIN', 60],
  ['HQ_RUN_QUIET_MIN', 60],
  ['HQ_RUN_REPEAT_MIN', 30],
  ['HQ_SEARCH_GAP_MS', 2_100],
  ['HQ_REF_LOCK_RETRY_MS', 3_000],
  ['HQ_SYNC_GIT_TIMEOUT_MS', 40_000],
  ['HQ_FETCH_RETRY_MS', 10_000],
  ['HQ_RC_POLL_MS', 15_000],
  ['HQ_SEND_WAIT_MS', 15_000],
  ['HQ_RESTORE_WAIT_MS', 180_000],
  ['HQ_QUIET', '03-07'],
  ['HQ_STATS_CUTOFF', '2026-10-14T20:00:00Z'],
];
const NUMERIC = DEFAULTS.filter(([, d]) => typeof d === 'number').map(([n]) => n);
const STRICT = NUMERIC.filter((n) => !['HQ_RC_POLL_MS', 'HQ_SEND_WAIT_MS', 'HQ_RESTORE_WAIT_MS'].includes(n));

test.each(DEFAULTS)('%s defaults to %p on an empty environment', (name, dflt) => {
  expect((config({}) as Record<string, unknown>)[name]).toBe(dflt);
});

test('settings with no default are undefined on an empty environment', () => {
  const c = config({}) as Record<string, unknown>;
  for (const n of ['HQ_DB', 'HQ_AS', 'HQ_NOTIFY', 'HQ_LIVE', 'REVIEW_DIR', 'HQ_REPOS', 'HQ_NOW', 'HQ_ATC_SOCKET']) expect(c[n]).toBeUndefined();
});

test('a set value is read, as a number for the numeric settings', () => {
  expect(config({ HQ_RUN_QUIET_MIN: '15', HQ_RUN_FINAL_MIN: '0', HQ_NOTIFY: 'off', REVIEW_DIR: '/invented/reviews' })).toMatchObject({ HQ_RUN_QUIET_MIN: 15, HQ_RUN_FINAL_MIN: 0, HQ_NOTIFY: 'off', REVIEW_DIR: '/invented/reviews' });
});

test.each(STRICT)('%s with a bad value fails naming the variable', (name) => {
  for (const bad of ['abc', '-1', '1.5']) {
    expect(() => config({ [name]: bad })).toThrow(`${name} must be a whole number, 0 or more, got '${bad}'`);
  }
  expect(() => config({ [name]: 'abc' })).toThrow(expect.objectContaining({ code: 'bad_config' }));
});

test('HQ_QUIET names the variable and what it must look like', () => {
  expect(() => config({ HQ_QUIET: 'night' })).toThrow("HQ_QUIET must be two hours like 03-07, got 'night'");
  expect(config({ HQ_QUIET: '22-6' }).HQ_QUIET).toBe('22-6');
});

test('a wait that was always lenient falls back to its default', () => {
  expect(config({ HQ_RESTORE_WAIT_MS: 'Infinity', HQ_SEND_WAIT_MS: '-5', HQ_RC_POLL_MS: 'x' })).toMatchObject({ HQ_RESTORE_WAIT_MS: 180_000, HQ_SEND_WAIT_MS: 15_000, HQ_RC_POLL_MS: 15_000 });
});

test('a bad setting stops a command at start, naming it; help, version and capabilities still work', async () => {
  process.env['HQ_RUN_QUIET_MIN'] = 'abc';
  process.env['HQ_DB'] = '/nonexistent/never-opened.db';
  const lines: string[] = [];
  const log = console.log;
  const err = console.error;
  console.log = (s: string) => lines.push(s);
  console.error = (s: string) => lines.push(s);
  try {
    expect(await main(['status'])).toBe(1);
    expect(lines.join('\n')).toContain("HQ_RUN_QUIET_MIN must be a whole number, 0 or more, got 'abc'");
    for (const argv of [['help'], ['--help'], ['version'], ['capabilities']]) {
      lines.length = 0;
      expect(await main(argv)).toBe(0);
    }
  } finally {
    console.log = log;
    console.error = err;
  }
});

test('no source file (tests aside) but src/config/config.ts reads an HQ_ setting or REVIEW_DIR from process.env', () => {
  const bad: string[] = [];
  for (const f of readdirSync('src', { recursive: true }).map(String)) {
    if (f === 'config/config.ts' || !/\.tsx?$/u.test(f) || /\.test\.tsx?$/u.test(f)) {
      continue;
    }
    if (/process\.env\.(HQ_|REVIEW_DIR)|process\.env\[['"`](HQ_|REVIEW_DIR)/.test(readFileSync(`src/${f}`, 'utf8'))) bad.push(f);
  }
  expect(bad).toEqual([]);
});

test('metaJson: a missing key gives the fallback, a valid value its parse, a malformed one bad_meta naming the key', () => {
  const { db, cleanup } = freshDb();
  try {
    expect(metaJson(db, 'invented_map', strMap, { a: 'b' })).toEqual({ a: 'b' });
    db.query("INSERT INTO meta (key, value) VALUES ('invented_map', ?)").run('{"x":"y"}');
    expect(metaJson(db, 'invented_map', strMap, {})).toEqual({ x: 'y' });
    db.query("UPDATE meta SET value = '{\"x\":4}' WHERE key = 'invented_map'").run();
    expect(() => metaJson(db, 'invented_map', strMap, {})).toThrow(expect.objectContaining({ code: 'bad_meta', message: expect.stringContaining("'invented_map'") }));
    db.query("UPDATE meta SET value = '{not json' WHERE key = 'invented_map'").run();
    expect(() => metaJson(db, 'invented_map', z.array(z.string()), [])).toThrow(expect.objectContaining({ code: 'bad_meta', message: expect.stringContaining("'invented_map'") }));
  } finally {
    cleanup();
  }
});

test('the atc schemas accept a session list with extra fields and optional parts missing', () => {
  const list = { sessions: [{ id: 'id-a', name: 'kettle', alive: true, state: 'running', cwd: '/invented', lifecycle: { harness: 'running' } }] };
  expect(answer('session.list', list, sessionListSchema).sessions?.[0]).toMatchObject({ id: 'id-a', cwd: '/invented' });
  expect(answer('session.list', {}, sessionListSchema).sessions).toBeUndefined();
  expect(answer('events.read', { events: [], cursor: 'c', more: false }, eventsReadSchema).more).toBe(false);
});

test('an atc answer missing a required field is bad_atc_answer naming the method and the field', () => {
  const bad = { sessions: [{ id: 'id-a', name: 'kettle', state: 'running' }] };
  expect(() => answer('session.list', bad, sessionListSchema)).toThrow(expect.objectContaining({ code: 'bad_atc_answer', message: expect.stringMatching(/session\.list.*sessions\.0\.alive/) }));
  expect(() => answer('session.list', {}, sessionListRequiredSchema)).toThrow(expect.objectContaining({ code: 'bad_atc_answer', message: expect.stringMatching(/session\.list.*sessions/) }));
  expect(() => answer('events.read', { events: [] }, eventsReadSchema)).toThrow(expect.objectContaining({ code: 'bad_atc_answer', message: expect.stringContaining('events.read') }));
});

test('a live client turns a bad session.list into bad_atc_answer', async () => {
  const base = mkdtempSync(`${tmpdir()}/hq-cfg-`),
    daemon = startStubAtcDaemon(`${base}/atc.sock`, { 'session.list': () => ({ sessions: [{ id: 'id-a' }] }) });
  try {
    const c = await AtcClient.open(daemon.path);
    await expect(c.sessions()).rejects.toMatchObject({ code: 'bad_atc_answer', message: expect.stringContaining('session.list') });
    c.close();
  } finally {
    daemon.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test('a fresh process with a bad setting still prints help and version, and a command exits 1 with the name', () => {
  const env = { ...process.env, HQ_RUN_QUIET_MIN: 'abc', HQ_DB: '/nonexistent/never-opened.db' };
  for (const argv of [['help'], ['version']]) expect(Bun.spawnSync(['bun', 'src/cli.ts', ...argv], { env }).exitCode).toBe(0);
  const r = Bun.spawnSync(['bun', 'src/cli.ts', 'status'], { env });
  expect(r.exitCode).toBe(1);
  expect(r.stderr.toString()).toContain('HQ_RUN_QUIET_MIN');
});
