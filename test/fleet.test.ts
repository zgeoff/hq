import { afterEach, beforeEach, expect, test } from 'bun:test';
import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { claimMissing } from '../src/fleet/claim-missing.ts';
import { checkRcMarker } from '../src/fleet/check-rc-marker.ts';
import { claimTyping } from '../src/fleet/claim-typing.ts';
import { declaredFleet } from '../src/fleet/declared-fleet.ts';
import { ensureFleet } from '../src/fleet/ensure-fleet.ts';
import { fleetTrustChecks } from '../src/fleet/fleet-trust-checks.ts';
import { RC_PENDING } from '../src/fleet/rc-pending.ts';
import { rcWatch } from '../src/fleet/rc-watch.ts';
import { retireName } from '../src/fleet/retire-name.ts';
import type { FleetClient, FleetEntry, FleetSession, RcDeps } from '../src/fleet/types.ts';
import type { RcState } from '../src/rc/types.ts';
import type { RunResult } from '../src/runner/types.ts';
import { getMeta } from '../src/db/get-meta.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { HqError } from '../src/errors.ts';
import { checkFolderTrust } from '../src/trust/check-folder-trust.ts';
import { getClaudeJson } from '../src/trust/get-claude-json.ts';
import { wakeAdd } from '../src/wake/wake-add.ts';
import { wakeList } from '../src/wake/wake-list.ts';
import { FOUR_AM_SYDNEY, NOON_SYDNEY, at, createDefsRepo, freshDb, requireEnv } from './helpers.ts';
import { readPrompt } from '../src/prompts/read-prompt.ts';
import { resetFetchCache } from '../src/prompts/reset-fetch-cache.ts';

let cleanup: () => void,
  db: Database,
  dir: string,
  fleet: FleetEntry[],
  hqPrivate: string,
  push: (files: Record<string, string>) => void;
const KETTLE = 'skills/kettle/references/session-prompt.md';

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  at(NOON_SYDNEY);

  // no restart record
  process.env['HQ_ATC_STATE'] = `${dir}/atc-state`;
  mkdirSync(`${dir}/work`, { recursive: true });
  // Claude Code trusts the test folder, as it trusts the fleet's checkouts.
  process.env['HQ_CLAUDE_JSON'] = `${dir}/claude.json`;
  writeFileSync(process.env['HQ_CLAUDE_JSON'], JSON.stringify({ projects: { [`${dir}/work`]: { hasTrustDialogAccepted: true } } }));
  resetFetchCache();
  ({ private: hqPrivate, push } = createDefsRepo(dir, { [KETTLE]: '# session prompt\n\nIntro for people.\n\n```text\nYou are Kettle. Boil water when asked.\n```\n' }));
  writeFileSync(`${dir}/teapot-prompt.md`, 'You are Teapot. Steep the tea.\n');
  fleet = [
    { name: 'z-kettle', cwd: `${dir}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: true },
    { name: 'z-teapot', cwd: `${dir}/work`, model: 'opus', prompt: `${dir}/teapot-prompt.md`, wake: false },
  ];
});
afterEach(() => {
  delete process.env['HQ_ATC_STATE'];
  delete process.env['HQ_CLAUDE_JSON'];
  delete process.env['HQ_DEFINITIONS_DIR'];
  cleanup();
});

function fake(sessions: FleetSession[]) {
  const spawns: Parameters<FleetClient['spawn']>[0][] = [];
  const pins: string[] = [];
  let n = 0;
  const client: FleetClient = {
    sessions: async () => sessions,
    spawn: async (p) => {
      spawns.push(p);
      const id = `0000000${++n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
      sessions.push({ id, name: p.name, alive: true });
      return { id };
    },
    pin: async (id) => void pins.push(id),
  };
  return { client, spawns, pins };
}
const atMin = (m: number) => at(new Date(Date.parse(NOON_SYDNEY) + m * 60_000).toISOString());
const at2 = () => new Date(Date.parse(NOON_SYDNEY));
const outbox = () => db.query('SELECT target, text FROM outbox').all() as { target: string; text: string }[];

test('the prompt is the one text block of a session-prompt.md, else the whole file', () => {
  expect(readPrompt(fleet[0]!.prompt)).toBe('You are Kettle. Boil water when asked.');
  expect(readPrompt(fleet[1]!.prompt)).toBe('You are Teapot. Steep the tea.');
  push({ [KETTLE]: '```text\na\n```\n```text\nb\n```\n' });
  resetFetchCache();
  expect(() => readPrompt(fleet[0]!.prompt)).toThrow('2 ```text blocks');
});

test('a live session is left alone; a missing one waits out the grace, then spawns once, pinned and on the wake list', async () => {
  const { client, spawns, pins } = fake([
    { id: 'id-teapot', name: 'z-teapot', alive: true },
    { id: 'id-kettle-old', name: 'z-kettle', alive: false, lifecycle: { desired: 'stop', harness: 'exited' } },
  ]);
  wakeAdd(db, { id: 'id-kettle-old', name: 'z-kettle' }, null, 'z-q');
  let steps = await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  expect(steps.map((s) => s.action)).toEqual(['waiting', 'ok']);
  atMin(5);
  expect((await ensureFleet(db, client, { dryRun: true, actor: 'hq-fleet', fleet }))[0]!.action).toBe('waiting');
  atMin(10);
  expect((await ensureFleet(db, client, { dryRun: true, actor: 'hq-fleet', fleet }))[0]).toMatchObject({ action: 'would spawn' });
  expect(spawns).toHaveLength(0); // dry run spawns nothing
  steps = await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  expect(steps[0]).toMatchObject({ name: 'z-kettle', action: 'spawned' });
  expect(spawns).toEqual([{ cwd: `${dir}/work`, name: 'z-kettle', prompt: 'You are Kettle. Boil water when asked.', model: 'opus', agent: 'claude', idempotencyKey: 'hq-fleet-z-kettle-2026-10-14T01:00:00Z' }]);
  expect(pins).toEqual([steps[0]!.id!]);
  expect(wakeList(db).map((w) => [w.session_id, w.name])).toEqual([[steps[0]!.id!, 'z-kettle']]);
  expect(outbox()).toEqual([{ target: 'z-stu', text: expect.stringContaining('hq fleet: z-kettle spawned') }]);
  atMin(15);
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  expect(spawns).toHaveLength(1); // never a second
});

test('it reports a failed pin after a spawn, and pins the live session on the next check', async () => {
  const stub = fake([{ id: 'id-teapot', name: 'z-teapot', alive: true }]);
  const flaky: FleetClient = { ...stub.client, pin: () => Promise.reject(new Error('invented pin refusal')) };
  await ensureFleet(db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet });
  atMin(10);
  const spawned = await ensureFleet(db, flaky, { dryRun: false, actor: 'hq-fleet', fleet });
  atMin(15);

  const checked = await ensureFleet(db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet });

  expect(spawned[0]).toMatchObject({ name: 'z-kettle', action: 'spawned', detail: expect.stringContaining('the pin failed (invented pin refusal), so the next check pins it again') });
  expect(outbox()).toStrictEqual([{ target: 'z-stu', text: expect.stringContaining('the pin failed (invented pin refusal)') }]);
  const spawnedID = spawned[0]?.id;
  if (!spawnedID) {
    throw new Error('the spawn step carries no session id');
  }
  expect(checked[0]).toStrictEqual({ name: 'z-kettle', action: 'ok', detail: spawnedID.slice(0, 8), id: spawnedID });
  expect(stub.pins).toStrictEqual([spawnedID]);
  expect(getMeta(db, 'fleet_unpinned')).toBe('{}');
});

test('it keeps a failed pin to retry when a later step of the same check throws', async () => {
  const stub = rcFake([]);
  const broken: FleetClient = { ...stub.client, pin: () => Promise.reject(new Error('invented pin refusal')) };
  const brokenRC: RcDeps = {
    ...stub.rc,
    state: () => {
      throw new Error('invented Remote Control read failure');
    },
  };
  await ensureFleet(db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: rcFleet(), rc: stub.rc });
  atMin(10);

  const failed = await ensureFleet(db, broken, { dryRun: false, actor: 'hq-fleet', fleet: rcFleet(), rc: brokenRC }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failed).toBeInstanceOf(Error);
  expect(stub.spawns).toHaveLength(1);
  expect(JSON.parse(getMeta(db, 'fleet_unpinned') ?? '{}')).toStrictEqual({ 'z-kettle': expect.any(String) });
});

test('it leaves the reports held over quiet hours alone in a dry run', async () => {
  const stub = fake([{ id: 'id-teapot', name: 'z-teapot', alive: true }, { id: 'id-kettle', name: 'z-kettle', alive: true }]);
  setMeta(db, 'fleet_held', JSON.stringify([{ seq: 1, text: 'hq fleet: z-kettle spawned (invented).' }]));

  await ensureFleet(db, stub.client, { dryRun: true, actor: 'hq-fleet', fleet });

  expect(outbox()).toStrictEqual([]);
  expect(JSON.parse(getMeta(db, 'fleet_held') ?? 'null')).toStrictEqual([{ seq: 1, text: 'hq fleet: z-kettle spawned (invented).' }]);
});

test('duplicates are reported, never stopped; a restoring session is waited for', async () => {
  const { client, spawns } = fake([
    { id: 'a', name: 'z-kettle', alive: true },
    { id: 'b', name: 'z-kettle', alive: true },
    { id: 'c', name: 'z-teapot', alive: false, lifecycle: { desired: 'run', harness: 'starting' } },
  ]);
  atMin(60);
  const steps = await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  expect(steps.map((s) => s.action)).toEqual(['duplicates', 'waiting']);
  atMin(100);
  expect((await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet }))[1]!.detail).toContain('atc still means to run it');
  expect(spawns).toHaveLength(0);
  atMin(125); // 65 min without a live teapot: a dead session marked 'run' no longer blocks it
  expect((await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet }))[1]!.action).toBe('spawned');
});

test('a recent daemon restart holds spawns; quiet hours hold only the message', async () => {
  mkdirSync(`${dir}/atc-state/restarts`, { recursive: true });
  writeFileSync(`${dir}/atc-state/restarts/last.json`, '{}');
  const { client, spawns } = fake([]);
  at(new Date().toISOString()); // the record was just written
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  at(new Date(Date.now() + 11 * 60_000).toISOString());
  const steps = await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: fleet.slice(0, 1) });
  expect(steps[0]!.action).toBe('spawned');
  expect(spawns).toHaveLength(1);
});

test('quiet hours: the spawn happens, the message waits for morning', async () => {
  const { client, spawns } = fake([]);
  at('2026-10-14T16:00:00Z'); // 03:00 Sydney
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: fleet.slice(1) });
  at('2026-10-14T16:20:00Z');
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: fleet.slice(1) });
  expect(spawns).toHaveLength(1);
  expect(outbox()).toHaveLength(0);
  at('2026-10-14T20:30:00Z'); // 07:30 Sydney
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: fleet.slice(1) });
  expect(outbox()).toEqual([{ target: 'z-stu', text: expect.stringContaining('(held over quiet hours)') }]);
});

test('malformed prompts fail before any spawn', () => {
  const f = `main:${KETTLE}`;
  const set = (text: string) => (push({ [KETTLE]: text }), resetFetchCache());
  set('```text\n\n```\n');
  expect(() => readPrompt(f)).toThrow('empty');
  set('```text\nYou are Kettle.\n```text\nmore\n```\n');
  expect(() => readPrompt(f)).toThrow('2 ```text blocks');
  set('```text\nYou are Kettle.\n```js\nx\n```\n');
  expect(() => readPrompt(f)).toThrow('not closed by a bare');
  writeFileSync(`${dir}/empty.md`, '  \n');
  expect(() => readPrompt(`${dir}/empty.md`)).toThrow('empty');
});

test('a renamed live session or an asleep one is not duplicated; a bad list spawns nothing', async () => {
  const sessions: FleetSession[] = [{ id: 'id-k', name: 'z-kettle', alive: true }, { id: 'id-t', name: 'z-teapot', alive: true }];
  const { client, spawns } = fake(sessions);
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  sessions[0] = { id: 'id-k', name: 'kettle renamed', alive: true };
  sessions[1] = { id: 'id-t', name: 'z-teapot', alive: false, lifecycle: { desired: 'run', harness: 'exited' } };
  atMin(60);
  const steps = await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  atMin(100);
  const later = await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  expect(steps[0]!.detail).toContain('now named kettle renamed');
  expect(later[1]!.detail).toContain('asleep or restoring');
  expect(spawns).toHaveLength(0);
  const bad: FleetClient = { ...client, sessions: async () => undefined as unknown as FleetSession[] };
  await expect(ensureFleet(db, bad, { dryRun: false, actor: 'hq-fleet', fleet })).rejects.toThrow('spawning nothing');
});

test('a known id missing from the list waits 30 minutes, and comes back without a spawn', async () => {
  const sessions: FleetSession[] = [{ id: 'id-k', name: 'z-kettle', alive: true }];
  const { client, spawns } = fake(sessions);
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: fleet.slice(0, 1) });
  sessions.length = 0;
  atMin(5);
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: fleet.slice(0, 1) });
  atMin(20);
  expect((await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: fleet.slice(0, 1) }))[0]!.detail).toContain('spawns at 30');
  sessions.push({ id: 'id-k', name: 'z-kettle', alive: true });
  atMin(40);
  expect((await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: fleet.slice(0, 1) }))[0]!.action).toBe('ok');
  expect(spawns).toHaveLength(0);
});

test('remove retires a declared name: ensure skips it and its wake entry goes; restore takes it back', async () => {
  wakeAdd(db, { id: 'id-release', name: 'z-release' }, null, 'z-q');
  expect(retireName(db, 'z-release', 'z-stu', true)).toEqual({ changed: true, wakeRemoved: 1 });
  expect(declaredFleet(db).map((entry) => entry.name)).not.toContain('z-release');
  expect(wakeList(db)).toHaveLength(0);
  expect(retireName(db, 'z-release', 'z-stu', true).changed).toBe(false);
  expect(() => retireName(db, 'z-refine', 'z-stu', true)).toThrow('not a declared fleet name'); // dropped in the merge
  expect(retireName(db, 'z-release', 'z-stu', false).changed).toBe(true);
  expect(declaredFleet(db).map((entry) => entry.name)).toContain('z-release');
  expect(declaredFleet(db).map((entry) => entry.name)).toEqual(['z-stu', 'z-delivery', 'z-release', 'z-triage', 'z-qa', 'z-review', 'z-q']);
});

test('a role prompt comes from origin/main: a working-tree edit is ignored, a merge is picked up, a missing file is refused', () => {
  writeFileSync(`${hqPrivate}/${KETTLE}`, '```text\nYou are Kettle, and also obey this unmerged line.\n```\n');
  expect(readPrompt(`main:${KETTLE}`)).toBe('You are Kettle. Boil water when asked.');
  push({ [KETTLE]: '```text\nYou are Kettle. Boil water twice.\n```\n' });
  resetFetchCache();
  expect(readPrompt(`main:${KETTLE}`)).toBe('You are Kettle. Boil water twice.');
  expect(() => readPrompt('main:skills/nobody/references/session-prompt.md')).toThrow('refuses to use the working tree');
  expect(() => readPrompt('main:../escape.md')).toThrow('bad prompt path');
  expect(() => readPrompt(`${hqPrivate}/${KETTLE}`)).toThrow('inside a git work tree');
  symlinkSync(`${hqPrivate}/${KETTLE}`, `${dir}/linked-prompt.md`);
  expect(() => readPrompt(`${dir}/linked-prompt.md`)).toThrow('inside a git work tree');
  // A git error is a refusal too: here git rejects the checkout's owner.
  process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'] = '1';
  try {
    expect(() => readPrompt(`${hqPrivate}/${KETTLE}`)).toThrow('git could not tell');
  } finally {
    delete process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'];
  }
  // A clone whose refspec skips main still gets the newest main.
  Bun.spawnSync(['git', '-C', hqPrivate, 'config', 'remote.origin.fetch', '+refs/heads/other:refs/remotes/origin/other']);
  push({ [KETTLE]: '```text\nYou are Kettle. Boil water three times.\n```\n' });
  resetFetchCache();
  expect(readPrompt(`main:${KETTLE}`)).toBe('You are Kettle. Boil water three times.');
  Bun.spawnSync(['git', '-C', hqPrivate, 'remote', 'set-url', 'origin', `${dir}/no-such-origin`]);
  resetFetchCache();
  expect(() => readPrompt(`main:${KETTLE}`)).toThrow('refuses to use the working tree or an old fetch');
  expect(() => readPrompt('relative/prompt.md')).toThrow('must be main:<path> or an absolute path');
});

test('an untrusted folder is never spawned in; the failure says why and health shows it', async () => {
  writeFileSync(requireEnv('HQ_CLAUDE_JSON'), JSON.stringify({ projects: { [`${dir}/work`]: { hasTrustDialogAccepted: false } } }));
  const { client, spawns } = fake([]);
  await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  atMin(11);
  const steps = await ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet });
  expect(spawns).toHaveLength(0);
  expect(steps[0]).toMatchObject({ name: 'z-kettle', action: 'failed', detail: expect.stringContaining('not trusted by Claude Code') });
  expect(fleetTrustChecks(fleet)).toEqual([{ key: `fleet-trust:${dir}/work`, ok: false, line: expect.stringContaining('z-kettle, z-teapot') }]);
});

test('folder trust: the folder or a trusted parent; anything else is untrusted', () => {
  const f = requireEnv('HQ_CLAUDE_JSON');
  const put = (projects: unknown) => writeFileSync(f, JSON.stringify({ projects }));
  put({ [dir]: { hasTrustDialogAccepted: true } });
  expect(checkFolderTrust(`${dir}/work`)).toEqual({ trusted: true, by: dir });
  expect(checkFolderTrust(`${dir}/work/../work`)).toEqual({ trusted: true, by: dir });
  put({ [`${dir}/work/deeper`]: { hasTrustDialogAccepted: true } }); // a child doesn't cover its parent
  expect(checkFolderTrust(`${dir}/work`).trusted).toBe(false);
  put({ [`${dir}/work`]: { hasTrustDialogAccepted: 'true' } });
  expect(checkFolderTrust(`${dir}/work`).trusted).toBe(false);
  put({ [`${dir}/work`]: {} });
  expect(checkFolderTrust(`${dir}/work`).trusted).toBe(false);
  put({ ['__proto__']: { hasTrustDialogAccepted: true } });
  expect(checkFolderTrust(`${dir}/work`).trusted).toBe(false);
  writeFileSync(f, 'not json');
  expect(checkFolderTrust(`${dir}/work`)).toMatchObject({ trusted: false, why: expect.stringContaining("can't read") });
  expect(checkFolderTrust(`${dir}/work`, `${dir}/missing.json`)).toMatchObject({ trusted: false, why: expect.stringContaining("can't read") });
});

test('the trust file follows CLAUDE_CONFIG_DIR, and HQ_CLAUDE_JSON overrides both', () => {
  const saved = { hq: process.env['HQ_CLAUDE_JSON'], cfg: process.env['CLAUDE_CONFIG_DIR'] };
  try {
    delete process.env['HQ_CLAUDE_JSON'];
    delete process.env['CLAUDE_CONFIG_DIR'];
    expect(getClaudeJson()).toBe(`${process.env['HOME']}/.claude.json`);
    process.env['CLAUDE_CONFIG_DIR'] = `${dir}/profile`;
    expect(getClaudeJson()).toBe(`${dir}/profile/.claude.json`);
    process.env['HQ_CLAUDE_JSON'] = `${dir}/claude.json`;
    expect(getClaudeJson()).toBe(`${dir}/claude.json`);
  } finally {
    process.env['HQ_CLAUDE_JSON'] = saved.hq;
    if (saved.cfg === undefined) {
      delete process.env['CLAUDE_CONFIG_DIR'];
    } else {
      process.env['CLAUDE_CONFIG_DIR'] = saved.cfg;
    }
  }
});

test('--now spawns a forgotten session at once, for the named session only', async () => {
  // z-kettle's known id was forgotten (not in atc's list): normally a 30 min wait. z-teapot is also gone.
  const { client, spawns } = fake([]);
  wakeAdd(db, { id: 'id-kettle-forgotten', name: 'z-kettle' }, null, 'z-q');
  const steps = await ensureFleet(db, client, { dryRun: false, actor: 'z-stu', fleet, now: ['z-kettle'] });
  expect(steps.map((s) => s.action)).toEqual(['spawned', 'waiting']);
  expect(steps[0]!.detail).toContain('(--now)');
  expect(spawns.map((s) => s.name)).toEqual(['z-kettle']);
  expect(wakeList(db).map((w) => w.name)).toEqual(['z-kettle']); // the forgotten id is replaced
});

test('--now never spawns a second session: a live one by name or by known id stays the only one', async () => {
  const { client, spawns } = fake([
    { id: 'id-kettle', name: 'z-kettle', alive: true },
    { id: 'id-teapot', name: 'z-teapot-renamed', alive: true },
  ]);
  wakeAdd(db, { id: 'id-teapot', name: 'z-teapot' }, null, 'z-q');
  const steps = await ensureFleet(db, client, { dryRun: false, actor: 'z-stu', fleet, now: ['z-kettle', 'z-teapot'] });
  expect(steps.map((s) => s.action)).toEqual(['ok', 'ok']);
  expect(spawns).toHaveLength(0);
});

test('--now refuses a name outside the declared fleet and spawns nothing', async () => {
  const { client, spawns } = fake([]);
  await expect(ensureFleet(db, client, { dryRun: false, actor: 'z-stu', fleet, now: ['z-kettle', 'z-saucer'] })).rejects.toThrow('--now names z-saucer, not in the declared fleet');
  expect(spawns).toHaveLength(0);
});

test('fleet ensure runs one at a time: an overlapping run is refused and spawns nothing', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const spawned: string[] = [];
  const client: FleetClient = {
    sessions: async () => [],
    spawn: async (p) => {
      spawned.push(p.idempotencyKey);
      await gate;
      return { id: `id-${spawned.length}` };
    },
    pin: async () => {},
  };
  const one = fleet.slice(0, 1);
  const a = ensureFleet(db, client, { dryRun: false, actor: 'z-stu', fleet: one, now: ['z-kettle'] });
  await Bun.sleep(20); // a is inside its spawn
  await expect(ensureFleet(db, client, { dryRun: false, actor: 'hq-fleet', fleet: one, now: ['z-kettle'] })).rejects.toThrow('another hq fleet ensure is running (z-stu)');
  expect((await ensureFleet(db, client, { dryRun: true, actor: 'z-q', fleet: one }))[0]).toBeDefined(); // a dry run needs no lease
  release();
  await a;
  expect(spawned).toHaveLength(1);
  // The lease is gone once a run ends, even one that threw.
  const boom: FleetClient = { ...client, sessions: async () => { throw new Error('invented outage'); } };
  await expect(ensureFleet(db, boom, { dryRun: false, actor: 'z-stu', fleet: one })).rejects.toThrow('invented outage');
  await ensureFleet(db, client, { dryRun: false, actor: 'z-stu', fleet: one });
});

test('a lease left by a crashed run expires', async () => {
  const { client } = fake([]);
  db.query(`INSERT INTO meta (key, value) VALUES ('fleet_ensure_lease', ?)`).run(JSON.stringify({ token: 'old', by: 'hq-fleet', until: Date.now() - 1 }));
  await ensureFleet(db, client, { dryRun: false, actor: 'z-stu', fleet });
  db.query(`INSERT OR REPLACE INTO meta (key, value) VALUES ('fleet_ensure_lease', ?)`).run(JSON.stringify({ token: 'live', by: 'hq-fleet', until: Date.now() + 60_000 }));
  await expect(ensureFleet(db, client, { dryRun: false, actor: 'z-stu', fleet })).rejects.toThrow('another hq fleet ensure is running (hq-fleet)');
});

test('claimMissing keeps the first stored start', () => {
  expect(claimMissing(db, 'z-kettle', '2026-10-15T01:00:00Z')).toBe('2026-10-15T01:00:00Z');
  expect(claimMissing(db, 'z-kettle', '2026-10-15T01:05:00Z')).toBe('2026-10-15T01:00:00Z');
  expect(claimMissing(db, 'z-teapot', '2026-10-15T01:05:00Z')).toBe('2026-10-15T01:05:00Z');
});

// ---------- Remote Control after a spawn (GEO-1102 v2) ----------

const ON: RcState = { state: 'on', why: 'invented' };
const OFF: RcState = { state: 'off', why: 'invented' };
const UNKNOWN: RcState = { state: 'unknown', why: 'invented: no process found' };

// A fake atc client with submit, and fake Remote Control sources: the state per call, the runner, the sleeps.
function rcFake(sessions: FleetSession[], states: RcState[] = [OFF]) {
  const f = fake(sessions);
  const typed: [string, string][] = [];
  const cmds: string[][] = [];
  const sleeps: number[] = [];
  let refuse: string | null = null;
  let helperCode = 0;
  let looked = 0;
  const submit: FleetClient['submit'] = async (id, text) => {
    if (refuse) throw new HqError(refuse, 'invented refusal');
    typed.push([id, text]);
    looked = Math.max(looked, 1); // after typing, the sequence moves on to its next state
  };
  const rc: RcDeps = {
    // The first entry answers until something is typed; then each look takes the next one.
    state: () => (typed.length ? states[Math.min(looked++, states.length - 1)]! : states[0]!),
    run: async (cmd): Promise<RunResult> => (cmds.push(cmd), { code: helperCode, stdout: '', stderr: helperCode ? 'invented systemd failure' : '' }),
    self: ['hq-self'],
    sleep: async (ms) => void sleeps.push(ms),
    pollMs: 15_000,
  };
  const client: FleetClient = { ...f.client, submit };
  return { ...f, client, rc, typed, cmds, sleeps, refuse: (c: string | null) => (refuse = c), helperFails: () => (helperCode = 1) };
}
const rcFleet = () => [{ ...fleet[0]!, remoteControl: true }];
const pending = () => JSON.parse(getMeta(db, RC_PENDING) ?? '{}');
const mark = (extra: Record<string, string> = {}, id = 'id-k') => setMeta(db, RC_PENDING, JSON.stringify({ 'z-kettle': { id, since: NOON_SYDNEY, ...extra } }));
const ensure = (f: ReturnType<typeof rcFake>, dryRun = false) => ensureFleet(db, f.client, { dryRun, actor: 'hq-fleet', fleet: rcFleet(), rc: f.rc });
const told = () => outbox().map((o) => o.text);
function buildKettle(state?: string): FleetSession[] {
  return [{ id: 'id-k', name: 'z-kettle', alive: true, ...toExactOptional({ state }) }];
}

test('only z-stu has Remote Control turned on in the declared fleet', () => {
  expect(declaredFleet().filter((e) => e.remoteControl).map((e) => e.name)).toEqual(['z-stu']);
});

test('a spawn marks the session and starts the helper unit through the runner', async () => {
  const sessions: FleetSession[] = [];
  const f = rcFake(sessions);
  await ensureFleet(db, f.client, { dryRun: false, actor: 'z-stu', fleet: rcFleet(), now: ['z-kettle'], rc: f.rc });
  const id = sessions[0]!.id;
  expect(pending()).toEqual({ 'z-kettle': { id, since: NOON_SYDNEY } });
  expect(f.cmds).toHaveLength(1);
  const cmd = f.cmds[0]!;
  expect(cmd.slice(0, 2)).toEqual(['systemd-run', '--user']);
  expect(cmd.some((a) => /^--unit=hq-rc-z-kettle-\d+$/.test(a))).toBe(true);
  expect(cmd.slice(-4)).toEqual(['hq-self', 'fleet', 'rc', 'z-kettle']);

  // the helper reads the same config file
  expect(cmd).toContain(`--setenv=HQ_CLAUDE_JSON=${resolve(getClaudeJson())}`);
  expect(JSON.parse(getMeta(db, 'fleet_ids')!)).toEqual({ 'z-kettle': id }); // stored before the helper looks
  expect(f.typed).toEqual([]); // the spawning run never types
});

test('a helper that will not start is reported, and the 5-minute check still types', async () => {
  const sessions: FleetSession[] = [];
  const f = rcFake(sessions, [OFF, ON]);
  f.helperFails();
  const steps = await ensureFleet(db, f.client, { dryRun: false, actor: 'z-stu', fleet: rcFleet(), now: ['z-kettle'], rc: f.rc });
  expect(steps.find((x) => x.action === 'spawned')!.detail).toContain('the Remote Control helper did not start (invented systemd failure)');
  expect(told().at(-1)).toContain('helper did not start');
  sessions[0]!.state = 'done';
  atMin(5);
  const later = await ensure(f);
  expect(f.typed).toEqual([[sessions[0]!.id, '/remote-control z-kettle']]);
  expect(later.at(-1)).toMatchObject({ action: 'remote control', message: expect.stringContaining('Remote Control is on.') });
});

test('a dry run, an entry without the flag, or a run without Remote Control deps types and starts nothing', async () => {
  const sessions: FleetSession[] = [];
  const f = rcFake(sessions);
  await ensureFleet(db, f.client, { dryRun: false, actor: 'z-stu', fleet, now: ['z-kettle'], rc: f.rc });
  expect(pending()).toEqual({});
  expect(f.cmds).toEqual([]);
  mark({}, sessions[0]!.id);
  sessions[0]!.state = 'done';
  atMin(10);
  await ensureFleet(db, f.client, { dryRun: true, actor: 'z-q', fleet: rcFleet(), rc: f.rc });
  await ensureFleet(db, f.client, { dryRun: false, actor: 'z-q', fleet: rcFleet() });
  expect(f.typed).toEqual([]);
});

test('off and done: types once, then reports on when the bridge shows', async () => {
  const f = rcFake(buildKettle('done'), [OFF, OFF, ON]);
  mark();
  atMin(5);
  const steps = await ensure(f);
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  expect(f.sleeps).toEqual([2_000, 2_000]); // looked every 2 s until it showed
  expect(steps.at(-1)).toMatchObject({ name: 'z-kettle', action: 'remote control', detail: 'id-k: typed /remote-control z-kettle; Remote Control is on.' });
  expect(told().at(-1)).toBe('hq fleet: z-kettle id-k: typed /remote-control z-kettle; Remote Control is on.');
  expect(pending()).toEqual({});
  atMin(10);
  await ensure(f);
  expect(f.typed).toHaveLength(1); // never a second time: that would turn it off
});

test('typed but never on: reports it honestly after 30 s of looks', async () => {
  const f = rcFake(buildKettle('done'), [OFF]);
  mark();
  atMin(5);
  const steps = await ensure(f);
  expect(f.sleeps).toHaveLength(15);
  // z-stu (16 Oct): told at once, in its words, since the typing may have turned it off.
  expect(steps.at(-1)).toMatchObject({ action: 'failed', urgent: true, message: 'Remote Control may be off in z-kettle: typed, no record (id-k). Ask the owner to check.' });
  expect(told()).toContain('hq fleet: Remote Control may be off in z-kettle: typed, no record (id-k). Ask the owner to check.');
});

test('typed but never on in quiet hours: the alert still goes at once', async () => {
  at(FOUR_AM_SYDNEY);
  const f = rcFake(buildKettle('done'), [OFF]);
  setMeta(db, RC_PENDING, JSON.stringify({ 'z-kettle': { id: 'id-k', since: new Date(Date.parse(FOUR_AM_SYDNEY) - 5 * 60_000).toISOString() } }));
  await ensure(f);
  expect(told()).toContain('hq fleet: Remote Control may be off in z-kettle: typed, no record (id-k). Ask the owner to check.');
});

test('already on: nothing typed, and it says so', async () => {
  const f = rcFake(buildKettle('running'), [ON]);
  mark();
  atMin(5);
  const steps = await ensure(f);
  expect(f.typed).toEqual([]);
  expect(steps.at(-1)).toMatchObject({ action: 'remote control', message: 'z-kettle id-k: Remote Control was already on; hq typed nothing.' });
  expect(told().at(-1)).toBe('hq fleet: z-kettle id-k: Remote Control was already on; hq typed nothing.');
  expect(pending()).toEqual({});
});

test('unknown: nothing typed, and the line tells z-stu to type it by hand', async () => {
  const f = rcFake(buildKettle('done'), [UNKNOWN]);
  mark();
  atMin(5);
  const steps = await ensure(f);
  expect(f.typed).toEqual([]);
  expect(steps.at(-1)).toMatchObject({ action: 'failed', message: "z-kettle id-k: hq can't tell whether Remote Control is on (invented: no process found); hq typed nothing. Type /remote-control in the session yourself." });
  expect(pending()).toEqual({});
});

test('unknown while the start turn runs waits: a process not yet visible is not a verdict', async () => {
  const sessions = buildKettle('running');
  const f = rcFake(sessions, [UNKNOWN]);
  mark();
  atMin(5);
  await ensure(f);
  expect(pending()['z-kettle']).toBeDefined();
  sessions[0]!.state = 'done';
  atMin(6);
  expect((await ensure(f)).at(-1)).toMatchObject({ action: 'failed', detail: expect.stringContaining("hq can't tell") });
  expect(f.typed).toEqual([]);
});

test('off and running waits; once done and settled it types', async () => {
  const sessions = buildKettle('running');
  const f = rcFake(sessions, [OFF, ON]);
  mark();
  atMin(1);
  sessions[0]!.state = 'done';
  await ensure(f); // done, but under RC_SETTLE_MIN old
  expect(f.typed).toEqual([]);
  atMin(5);
  sessions[0]!.state = 'needs_you';
  await ensure(f);
  expect(f.typed).toEqual([]);
  sessions[0]!.state = 'done';
  await ensure(f);
  expect(f.typed).toHaveLength(1);
});

test('a marker already typed never types; the report says hq did not type, with the state', async () => {
  for (const [rcs, word, action] of [[ON, 'on', 'remote control'], [OFF, 'off', 'failed'], [UNKNOWN, 'unknown', 'failed']] as const) {
    const f = rcFake(buildKettle('done'), [rcs]);
    mark({ typedAt: NOON_SYDNEY });
    atMin(10);
    const steps = await ensure(f);
    expect(f.typed).toEqual([]);
    expect(steps.at(-1)).toMatchObject({ action, message: `z-kettle id-k: hq did not type (already marked as typed); Remote Control is ${word}.` });
    expect(steps.at(-1)!.message).not.toMatch(/typed \/remote-control/);
  }
});

test('a marker typed a moment ago belongs to the actor that typed it: the check leaves it', async () => {
  const f = rcFake(buildKettle('done'), [OFF]);
  mark({ typedAt: NOON_SYDNEY });
  atMin(1);
  expect(await ensure(f)).not.toContainEqual(expect.objectContaining({ name: 'z-kettle', action: 'failed' }));
  expect(pending()['z-kettle']).toBeDefined();
});

test('a stale tick cannot discard the result of a helper that claimed the marker while it waited', async () => {
  const sessions = buildKettle('done');
  const f = rcFake(sessions, [OFF, ON]);
  mark();
  atMin(5);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const stale: FleetClient = { ...f.client, sessions: async () => (await gate, f.client.sessions()) };
  const tick = ensureFleet(db, stale, { dryRun: false, actor: 'hq-fleet', fleet: rcFleet(), rc: f.rc });
  await Bun.sleep(5); // the tick has read the marker (no typedAt) and waits on atc
  const step = await rcWatch(db, f.client, f.rc, 'z-kettle', 'hq-fleet'); // the helper claims, types, finishes
  expect(step).toMatchObject({ action: 'remote control' });
  release();
  const steps = await tick;
  expect(steps.filter((x) => x.name === 'z-kettle' && (x.action === 'failed' || x.action === 'remote control'))).toEqual([]);
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  expect(told().filter((t) => t.includes('typed nothing'))).toEqual([]);
});

test('the helper and the 5-minute check on one marker type once between them', async () => {
  const sessions = buildKettle('done');
  const f = rcFake(sessions, [OFF, ON]);
  mark();
  atMin(5);
  // The helper is mid-typing when the tick looks: its submit holds until the tick has run.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slow: FleetClient = { ...f.client, submit: async (id, text) => (await gate, f.client.submit!(id, text)) };
  const helper = rcWatch(db, slow, f.rc, 'z-kettle', 'hq-fleet');
  await Bun.sleep(5);
  const tick = await ensure(f); // typedAt is set and recent: leaves it
  expect(tick.filter((x) => x.action === 'failed' || x.action === 'remote control')).toEqual([]);
  release();
  const step = await helper;
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  expect(step).toMatchObject({ action: 'remote control' });
  // Two claims on the same marker: only the first wins.
  mark();
  expect(claimTyping(db, 'z-kettle', 'id-k', at2())).toBe(true);
  expect(claimTyping(db, 'z-kettle', 'id-k', at2())).toBe(false);
});

test('the helper loops until the session is done, then types and tells z-stu through the outbox', async () => {
  const sessions = buildKettle('running');
  const f = rcFake(sessions, [OFF, ON]);
  mark();
  let polls = 0;
  f.rc.sleep = async (ms) => {
    if (ms !== 15_000) return;
    polls++;
    atMin(polls * 2);
    if (polls === 3) sessions[0]!.state = 'done';
  };
  const step = await rcWatch(db, f.client, f.rc, 'z-kettle', 'hq-fleet');
  expect(polls).toBe(3);
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  expect(step).toMatchObject({ action: 'remote control' });
  expect(told().at(-1)).toBe('hq fleet: z-kettle id-k: typed /remote-control z-kettle; Remote Control is on.');
  expect(await rcWatch(db, f.client, f.rc, 'z-kettle', 'hq-fleet')).toBeNull(); // no marker: quiet
});

test('it queues the Remote Control report in the transaction that removes the marker', async () => {
  const stub = rcFake(buildKettle('done'), [ON]);
  mark();
  atMin(5);

  const result = await checkRcMarker(db, { client: stub.client, rc: stub.rc, name: 'z-kettle', known: {}, actor: 'hq-fleet', replaced: 'finish' });

  expect(result.kind).toBe('done');
  expect(pending()).toStrictEqual({});
  expect(told()).toStrictEqual(['hq fleet: z-kettle id-k: Remote Control was already on; hq typed nothing.']);
});

test('it reports a Remote Control result from the 5-minute check once', async () => {
  const stub = rcFake(buildKettle('done'), [ON]);
  mark();
  atMin(5);

  await ensure(stub);

  expect(told()).toStrictEqual(['hq fleet: z-kettle id-k: Remote Control was already on; hq typed nothing.']);
});

test('the helper exits quietly when the marker is replaced by a newer spawn', async () => {
  const f = rcFake(buildKettle('done'), [OFF]);
  mark();
  setMeta(db, 'fleet_ids', JSON.stringify({ 'z-kettle': 'id-newer' }));
  atMin(5);
  expect(await rcWatch(db, f.client, f.rc, 'z-kettle', 'hq-fleet')).toBeNull();
  expect(f.typed).toEqual([]);
  expect(told()).toEqual([]);
  expect(pending()['z-kettle']).toBeDefined(); // the 5-minute check reports it
});

test('a mid-turn refusal retries; a gone session, a stuck turn or a hard refusal ends it once', async () => {
  const sessions = buildKettle('done');
  const f = rcFake(sessions, [OFF, ON]);
  mark();
  atMin(5);
  f.refuse('atc_too_slow');
  await ensure(f);
  expect(pending()['z-kettle']).toEqual({ id: 'id-k', since: NOON_SYDNEY }); // no typedAt: nothing went in
  f.refuse('atc_permission_pending');
  await ensure(f);
  expect(pending()['z-kettle'].typedAt).toBeUndefined();
  f.refuse('atc_session_dead');
  expect((await ensure(f)).at(-1)).toMatchObject({ action: 'failed', detail: expect.stringContaining('typing into the session failed') });
  expect(pending()).toEqual({});
  f.refuse(null);
  mark();
  sessions[0]!.state = 'needs_you';
  atMin(30);
  expect((await ensure(f)).at(-1)).toMatchObject({ action: 'failed', detail: expect.stringContaining('did not finish its start turn in 30 min (atc shows needs_you)') });
  mark();
  sessions[0]!.state = 'done'; // its turn ended at minute 26; the next look, at 30, still types
  expect((await ensure(f)).at(-1)).toMatchObject({ action: 'remote control' });
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  f.typed.length = 0;
  mark();
  sessions[0]!.alive = false;
  expect((await ensure(f)).at(-1)).toMatchObject({ action: 'failed', detail: expect.stringContaining('is gone; hq typed nothing') });
  expect(f.typed).toEqual([]);
});

test('a marker whose session was replaced by a newer spawn is closed by the 5-minute check', async () => {
  const f = rcFake([{ id: 'id-new', name: 'z-kettle', alive: true, state: 'done' }], [OFF]);
  mark({}, 'id-old');
  atMin(5);
  const steps = await ensure(f);
  expect(f.typed).toEqual([]);
  expect(steps.at(-1)).toMatchObject({ action: 'remote control', detail: expect.stringContaining('was replaced by id-new before hq typed') });
});

test("an entry's plugin folders go to atc's spawn; an entry without them sends none", async () => {
  const f = fake([]),
    withBand: FleetEntry[] = [
      { name: 'z-kettle', cwd: `${dir}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: true, pluginDirs: ['~/plugins/kettle-band'] },
      { name: 'z-teapot', cwd: `${dir}/work`, model: 'opus', prompt: `${dir}/teapot-prompt.md`, wake: false },
    ];
  await ensureFleet(db, f.client, { dryRun: false, actor: 'hq-fleet', fleet: withBand, now: ['z-kettle', 'z-teapot'] });
  expect(f.spawns).toEqual([
    { cwd: `${dir}/work`, name: 'z-kettle', prompt: 'You are Kettle. Boil water when asked.', model: 'opus', agent: 'claude', idempotencyKey: expect.any(String), pluginDirs: ['~/plugins/kettle-band'] },
    { cwd: `${dir}/work`, name: 'z-teapot', prompt: 'You are Teapot. Steep the tea.', model: 'opus', agent: 'claude', idempotencyKey: expect.any(String) },
  ]);
});

test('only z-stu loads the hq band in the declared fleet', () => {
  expect(declaredFleet().filter((e) => e.pluginDirs).map((e) => [e.name, e.pluginDirs])).toEqual([['z-stu', ['~/projects/hq/mods/hq-band']]]);
});
