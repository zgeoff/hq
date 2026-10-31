import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isContention } from '../src/defs/is-contention.ts';
import { originMatches } from '../src/defs/origin-matches.ts';
import { parseSource } from '../src/defs/parse-source.ts';
import { preflight } from '../src/defs/preflight.ts';
import { runTreeSyncTick } from '../src/defs/run-tree-sync-tick.ts';
import { runTreeSync } from '../src/defs/run-tree-sync.ts';
import { readTreeCheck } from '../src/defs/read-tree-check.ts';
import { useSource } from '../src/defs/use-source.ts';
import { defsSource } from '../src/prompts/defs-source.ts';
import { DEFS_SOURCES } from '../src/prompts/defs-sources.ts';
import { DEFS } from '../src/prompts/defs.ts';
import { declaredFleet } from '../src/fleet/declared-fleet.ts';
import { LANES } from '../src/lanes/lanes.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { createTreeCheckout } from './create-tree-checkout.ts';
import { createHqDefsRepo, freshDb, requireEnv } from './helpers.ts';
import { readPrivateFixture } from './read-private-fixture.ts';
import { waitFor } from './wait-for.ts';

let db: Database;
let dir: string;
let cleanup: () => void;

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  process.env['HOME'] = dir;
  process.env['HQ_DEFS_SOURCE_FILE'] = `${dir}/z-sessions/defs-source`;
  process.env['HQ_PRIVATE_DIR'] = `${dir}/.local/share/atc/workspaces/hq-private`;
  delete process.env['HQ_DEFINITIONS_DIR'];
});
afterEach(() => {
  delete process.env['HQ_DEFS_SOURCE_FILE'];
  delete process.env['HQ_DEFINITIONS_DIR'];
  delete process.env['HQ_SYNC_GIT_TIMEOUT_MS'];
  cleanup();
});

// A ready hq checkout at the hq source's directory: every role prompt on main, and the lane files.
function readyHq(files: Record<string, string> = {}) {
  const all: Record<string, string> = { 'skills/agent-delegation/scripts/capacity.sh': '#!/bin/sh\n', 'skills/agent-delegation/pacing.json': '{}\n', ...files },
    repo = createHqDefsRepo(`${dir}/build`, all);

  // createHqDefsRepo sets it; these tests go through the switch
  delete process.env['HQ_DEFINITIONS_DIR'];
  process.env['HQ_PRIVATE_DIR'] = `${dir}/.local/share/atc/workspaces/hq-private`;
  mkdirSync(`${dir}/.local/share/atc/workspaces`, { recursive: true });
  Bun.spawnSync(['git', 'clone', '-q', `${dir}/build/origin`, DEFS_SOURCES.hq.dir()]);
  // The origin as gh sets it; insteadOf sends the fetch to the local origin.
  Bun.spawnSync(['git', '-C', DEFS_SOURCES.hq.dir(), 'remote', 'set-url', 'origin', 'git@github.com:zgeoff/hq.git']);
  Bun.spawnSync(['git', '-C', DEFS_SOURCES.hq.dir(), 'config', `url.${dir}/build/origin.insteadOf`, 'git@github.com:zgeoff/hq.git']);
  return { defs: repo.defs, push: repo.push };
}

// Both trees ready for a full `hq defs check`: hq-defs with what the grants check reads of it, and
// hq-private with every role prompt. `privateFiles` replace files in hq-private.
function createReadyBoth(privateFiles: Record<string, string> = {}) {
  const fixture = readPrivateFixture();
  readyHq(fixture.hqFiles);
  return createTreeCheckout(dir, 'private', { ...fixture.privateFiles, ...privateFiles });
}

test('no switch file means hq; an unknown value is refused, never guessed', () => {
  expect(defsSource()).toBe('hq');
  expect(DEFS()).toBe(`${dir}/.local/share/atc/workspaces/hq-defs`);
  mkdirSync(`${dir}/z-sessions`, { recursive: true });

  for (const bad of ['nixie-definitions', 'hq-old', '', 'NIXIE-DEFINITIONS', '../hq', 'hq; rm -rf /', '__proto__', 'constructor', 'toString']) {
    writeFileSync(requireEnv('HQ_DEFS_SOURCE_FILE'), `${bad}\n`);
    expect(() => defsSource()).toThrow('it must be hq');
  }
  writeFileSync(requireEnv('HQ_DEFS_SOURCE_FILE'), 'hq\n');
  expect(DEFS()).toBe(`${dir}/.local/share/atc/workspaces/hq-defs`);
  process.env['HQ_DEFINITIONS_DIR'] = '/elsewhere';
  expect(DEFS()).toBe('/elsewhere');
});

test.each(['', 'HQ', 'private', 'hq-private', 'nixie', 'nixie-definitions', 'hq ', 'zgeoff/hq', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])('hq defs use refuses the source %p', (raw) => expect(() => parseSource(raw)).toThrow('the source must be'));

test('a switch needs a passing preflight; a failed one changes nothing', () => {
  expect(preflight('hq')[0]).toMatchObject({ ok: false, line: expect.stringContaining('not a checkout') });
  expect(() => useSource(db, 'hq', 'z-stu')).toThrow('hq is not ready; nothing changed');

  // nothing written
  expect(existsSync(requireEnv('HQ_DEFS_SOURCE_FILE'))).toBe(false);
  createReadyBoth({ 'skills/preview-qa/references/session-prompt.md': '```text\na\n```\n```text\nb\n```\n' });
  const checks = preflight('hq');
  expect(checks.filter((c) => !c.ok).map((c) => c.line)).toEqual([expect.stringContaining('z-qa: origin/main:skills/preview-qa/references/session-prompt.md: 2 ```text blocks'), expect.stringContaining('grants: grants.ts --check --private failed')]);
  expect(() => useSource(db, 'hq', 'z-stu')).toThrow('z-qa');
  expect(existsSync(requireEnv('HQ_DEFS_SOURCE_FILE'))).toBe(false);
});

test('it checks the lane files in delivery-lead once the rebuilt tree holds them', () => {
  readyHq({ 'skills/delivery-lead/scripts/capacity.sh': '#!/bin/sh\n', 'skills/delivery-lead/pacing.json': '{}\n' });

  expect(preflight('hq').filter((check) => check.line.includes('in the working tree'))).toStrictEqual([
    { ok: true, line: 'skills/delivery-lead/scripts/capacity.sh present in the working tree' },
    { ok: true, line: 'skills/delivery-lead/pacing.json present in the working tree' },
  ]);
});

test('a ready checkout writes the switch file, and the event records it', () => {
  createReadyBoth();
  expect(preflight('hq').every((c) => c.ok)).toBe(true);
  const r = useSource(db, 'hq', 'z-stu');
  expect(r).toMatchObject({ from: 'none', to: 'hq' });
  expect(readFileSync(requireEnv('HQ_DEFS_SOURCE_FILE'), 'utf8')).toBe('hq\n');
  expect(defsSource()).toBe('hq');
  expect(DEFS()).toBe(DEFS_SOURCES.hq.dir());
  expect(db.query(`SELECT actor, from_state, to_state FROM events WHERE action = 'source'`).get()).toEqual({ actor: 'z-stu', from_state: 'none', to_state: 'hq' });

  // the preflight restored the environment
  expect(process.env['HQ_DEFINITIONS_DIR']).toBeUndefined();
  expect(defsSource()).toBe('hq');
});

test('hq defs use repairs a switch file with a bad value', () => {
  createReadyBoth();
  mkdirSync(`${dir}/z-sessions`, { recursive: true });
  writeFileSync(requireEnv('HQ_DEFS_SOURCE_FILE'), 'hq-old\n');
  expect(() => defsSource()).toThrow('it must be');
  expect(useSource(db, 'hq', 'z-stu')).toMatchObject({ from: 'hq-old', to: 'hq' });
  expect(defsSource()).toBe('hq');
});

test('a checkout of another repo fails the preflight', () => {
  createReadyBoth();
  Bun.spawnSync(['git', '-C', DEFS_SOURCES.hq.dir(), 'remote', 'set-url', 'origin', 'git@github.com:zgeoff/nixie-definitions.git']);
  expect(preflight('hq')).toEqual([{ ok: false, line: expect.stringContaining('not zgeoff/hq') }]);
  expect(() => useSource(db, 'hq', 'z-stu')).toThrow('nothing changed');
  // Two origin urls: fetch uses the first, so a matching last one is not enough.
  Bun.spawnSync(['git', '-C', DEFS_SOURCES.hq.dir(), 'remote', 'set-url', 'origin', 'https://example.com/other.git']);
  Bun.spawnSync(['git', '-C', DEFS_SOURCES.hq.dir(), 'config', '--add', 'remote.origin.url', 'git@github.com:zgeoff/hq.git']);
  expect(preflight('hq')).toEqual([{ ok: false, line: expect.stringContaining('origin is 2 urls') }]);
});

test.each([
  ['https://github.com/zgeoff/hq.git', true],
  ['https://github.com/zgeoff/hq', true],
  ['git@github.com:zgeoff/hq.git', true],
  ['ssh://git@github.com/zgeoff/hq.git', true],
  ['https://github.com/zgeoff/hq-defs.git', false],
  ['https://github.com/other/hq.git', false],
  ['https://evil.example/github.com/zgeoff/hq.git', false],
  ['git@github.com:zgeoff/hq/extra.git', false],
  ['/tmp/hq', false],
  ['', false],
])('origin %p matches zgeoff/hq: %p', (url, ok) => expect(originMatches(url, 'zgeoff/hq')).toBe(ok));

const hqGit = (...a: string[]) => Bun.spawnSync(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-C', DEFS_SOURCES.hq.dir(), ...a]);
const hqHead = () => hqGit('rev-parse', 'HEAD').stdout.toString().trim();

function buildLater(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

test('the tree sync fast-forwards hq-defs to origin/main and records it', () => {

  // no checkout yet
  expect(runTreeSync()).toBeNull();
  expect(readTreeCheck(db, new Date())).toBeNull();
  const { push } = readyHq();
  expect(runTreeSync()).toMatchObject({ ok: true, changed: false, line: expect.stringContaining('is on origin/main') });
  const before = hqHead();
  push({ 'skills/intake/SKILL.md': 'an invented change\n' });
  expect(runTreeSyncTick(db, 'z-q')).toMatchObject({ ok: true, changed: true, line: expect.stringContaining('fast-forwarded') });
  expect(hqHead()).not.toBe(before);
  expect(readFileSync(`${DEFS_SOURCES.hq.dir()}/skills/intake/SKILL.md`, 'utf8')).toBe('an invented change\n');
  expect(db.query(`SELECT action FROM events WHERE action = 'tree-forwarded'`).all()).toHaveLength(1);
  expect(readTreeCheck(db, new Date())).toMatchObject({ key: 'defs-tree', ok: true });
  expect(readTreeCheck(db, buildLater(31))).toMatchObject({ ok: false, line: expect.stringContaining('over 30 min ago') });
});

test('the tree sync refuses a dirty tree, another branch, local commits and a wrong origin', () => {
  const { push } = readyHq();
  expect(readTreeCheck(db, new Date())).toMatchObject({ ok: false, line: expect.stringContaining('never synced') });
  push({ 'skills/intake/SKILL.md': 'upstream\n' });
  const before = hqHead();
  appendFileSync(`${DEFS_SOURCES.hq.dir()}/skills/agent-delegation/pacing.json`, ' ');
  expect(runTreeSyncTick(db, 'z-q')).toMatchObject({ ok: false, line: expect.stringContaining('dirty (1 changed file(s))') });
  expect(readTreeCheck(db, new Date())).toMatchObject({ ok: false, line: expect.stringContaining('dirty') });
  hqGit('checkout', '-q', '--', '.');
  writeFileSync(`${DEFS_SOURCES.hq.dir()}/scratch.txt`, 'untracked\n'); // untracked files don't count as dirty
  hqGit('checkout', '-q', '-b', 'side');
  expect(runTreeSync()).toMatchObject({ ok: false, line: expect.stringContaining('on branch side, not main') });
  hqGit('checkout', '-q', 'main');
  hqGit('commit', '-q', '--allow-empty', '-m', 'a local commit');
  expect(runTreeSync()).toMatchObject({ ok: false, line: expect.stringContaining('has commits origin/main') });
  hqGit('reset', '-q', '--hard', before);
  hqGit('remote', 'set-url', 'origin', 'git@github.com:zgeoff/nixie-definitions.git');
  expect(runTreeSync()).toMatchObject({ ok: false, line: expect.stringContaining('not zgeoff/hq') });
  expect(hqHead()).toBe(before);
});

test.each([
  ['not json {', 'unreadable'],
  [JSON.stringify({ at: 'yesterday', ok: true, changed: false, line: 'x' }), 'unreadable'],
  [JSON.stringify({ at: new Date().toISOString(), ok: 'yes', changed: false, line: 'x' }), 'unreadable'],
  [JSON.stringify({ at: new Date().toISOString(), ok: true, changed: false }), 'unreadable'],
  [JSON.stringify({ at: new Date(Date.now() + 3_600_000).toISOString(), ok: true, changed: false, line: 'x' }), 'in the future'],
])('the defs-tree health check fails on the stored record %p', (raw, why) => {
  readyHq();
  setMeta(db, 'defs_tree_sync', raw);
  expect(readTreeCheck(db, new Date())).toMatchObject({ key: 'defs-tree', ok: false, line: expect.stringContaining(why) });
});

test('a ref lock held by another git is retried, then left for the next tick; twice in a row it goes red', () => {
  const { push } = readyHq();
  push({ 'skills/intake/SKILL.md': 'upstream\n' });
  const lock = `${DEFS_SOURCES.hq.dir()}/.git/refs/remotes/origin/main.lock`;
  writeFileSync(lock, ''); // another git's fetch, mid-update
  expect(runTreeSyncTick(db, 'hq-lanes')).toMatchObject({ ok: true, transient: true, changed: false, line: expect.stringContaining('another git holds a ref lock') });
  expect(readTreeCheck(db, new Date())).toMatchObject({ ok: true });
  expect(runTreeSyncTick(db, 'hq-lanes')).toMatchObject({ ok: false, transient: true, line: expect.stringContaining('the same on the tick before') });
  expect(readTreeCheck(db, new Date())).toMatchObject({ ok: false });
  const { unlinkSync } = require('node:fs') as typeof import('node:fs');
  unlinkSync(lock);
  expect(runTreeSyncTick(db, 'hq-lanes')).toMatchObject({ ok: true, changed: true });
});

test('a real fetch failure is red at once, not retried as a lock', () => {
  readyHq();
  hqGit('config', `url.${dir}/nowhere.insteadOf`, 'git@github.com:zgeoff/hq.git');
  hqGit('config', '--unset-all', `url.${dir}/build/origin.insteadOf`);
  expect(runTreeSync()).toMatchObject({ ok: false, line: expect.stringContaining('git fetch failed') });
});

test('a hung fetch is stopped and releases the sync lock (GEO-1147)', () => {
  readyHq();
  process.env['HQ_SYNC_GIT_TIMEOUT_MS'] = '1000';
  hqGit('config', 'protocol.ext.allow', 'always');
  hqGit('config', `url.ext::sh -c sleep% 31337.insteadOf`, 'git@github.com:zgeoff/hq.git');
  hqGit('config', '--unset-all', `url.${dir}/build/origin.insteadOf`);
  const began = Date.now(),
    lock = `${DEFS_SOURCES.hq.dir()}/.git/hq-sync.lock`,
    s = runTreeSync();
  expect(s).toMatchObject({ ok: false, line: expect.stringContaining('git fetch failed (124)') });
  expect(Date.now() - began).toBeLessThan(8000);
  expect(Bun.spawnSync(['flock', '-n', lock, 'true']).exitCode).toBe(0);
  expect(Bun.spawnSync(['pgrep', '-f', 'sleep 3133[7]']).exitCode).toBe(1);
});

test("hq's own sync waits for its flock, then runs", async () => {
  readyHq();
  const lock = `${DEFS_SOURCES.hq.dir()}/.git/hq-sync.lock`;
  const held = Bun.spawn(['flock', lock, 'sleep', '0.5']);
  await waitFor('the holder to take the flock', () => Bun.spawnSync(['flock', '-n', lock, 'true']).exitCode !== 0);
  const t0 = Date.now();
  expect(runTreeSync()).toMatchObject({ ok: true });
  expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
  await held.exited;
});

test.each([
  ["error: cannot lock ref 'refs/remotes/origin/main': is at 1a86880f00 but expected 2568476aa0", true],
  ["error: cannot lock ref 'refs/remotes/origin/main': Unable to create '/x/.git/refs/remotes/origin/main.lock': File exists.", true],
  ["error: cannot lock ref 'refs/remotes/origin/main': Unable to create '/x/.git/refs/remotes/origin/main.lock': Permission denied", false],
  ["error: Unable to create '/x/.git/refs/remotes/origin/main.lock': File exists. ... Read-only file system", false],
  ["error: cannot lock ref 'refs/remotes/origin/main': unable to write: No space left on device", false],
  ['fatal: unable to update local ref', false],
  ['fatal: Authentication failed', false],
  ['', false],
])('%p is contention: %p', (err, yes) => expect(isContention(err)).toBe(yes));

test('one setting moves the definitions checkout for the fleet, the lanes and the prompts (GEO-1019)', () => {
  const cap = process.env['HQ_CAPACITY'];
  const DEFS_USERS = ['z-stu', 'z-delivery', 'z-triage', 'z-steward', 'z-qa', 'z-review']; // z-q works in hq's own repo
  const users = () => ({ fleet: [...new Set(declaredFleet().filter((e) => DEFS_USERS.includes(e.name)).map((e) => e.cwd))], capacity: LANES.capacityScript(), prompts: DEFS() });
  delete process.env['HQ_CAPACITY'];
  try {
    // The switch file (the config file): hq-defs under the workspaces root.
    createReadyBoth();
    useSource(db, 'hq', 'test');
    const hqDir = DEFS_SOURCES.hq.dir();
    expect(users()).toEqual({ fleet: [hqDir], capacity: `${hqDir}/skills/agent-delegation/scripts/capacity.sh`, prompts: hqDir });
    // The env var wins over the file.
    process.env['HQ_DEFINITIONS_DIR'] = `${dir}/elsewhere`;
    expect(users()).toStrictEqual({ fleet: [`${dir}/elsewhere`], capacity: `${dir}/elsewhere/skills/delivery-lead/scripts/capacity.sh`, prompts: `${dir}/elsewhere` });
  } finally {
    delete process.env['HQ_DEFINITIONS_DIR'];
    if (cap !== undefined) {
      process.env['HQ_CAPACITY'] = cap;
    }
  }
});

// Recursive, since source sits in area folders; tests beside their modules are skipped.
test("the workspaces path is written once in hq's source", () => {
  const hits = readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .flatMap((f) => (readFileSync(`src/${f}`, 'utf8').match(/\.local\/share\/atc\/workspaces/gu) ?? []).map(() => f));
  expect(hits).toEqual(['prompts/defs-sources.ts']);
});
