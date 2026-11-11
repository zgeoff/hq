import { toExactOptional } from '@zgeoff/std';
import assert from 'node:assert';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AtcClient } from '../src/atc/atc-client.ts';
import { makeFleetClient } from '../src/fleet/make-fleet-client.ts';
import { startStubAtcDaemon } from './start-stub-atc-daemon.ts';
import { claimMissing } from '../src/fleet/claim-missing.ts';
import { checkRcMarker } from '../src/fleet/check-rc-marker.ts';
import { claimTyping } from '../src/fleet/claim-typing.ts';
import { declaredFleet } from '../src/fleet/declared-fleet.ts';
import { ensureFleet } from '../src/fleet/ensure-fleet.ts';
import { writeFleetModel } from '../src/model/write-fleet-model.ts';
import { fleetTrustChecks } from '../src/fleet/fleet-trust-checks.ts';
import { loadRcPending } from '../src/fleet/load-rc-pending.ts';
import { RC_PENDING } from '../src/fleet/rc-pending.ts';
import { rcWatch } from '../src/fleet/rc-watch.ts';
import { retireName } from '../src/fleet/retire-name.ts';
import type { FleetClient, FleetEntry, FleetSession, RcDeps } from '../src/fleet/types.ts';
import type { RcState } from '../src/rc/types.ts';
import type { RunResult } from '../src/runner/types.ts';
import { getMeta } from '../src/db/get-meta.ts';
import { listNews } from '../src/news/list-news.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { HqError } from '../src/errors.ts';
import { checkFolderTrust } from '../src/trust/check-folder-trust.ts';
import { getClaudeJson } from '../src/trust/get-claude-json.ts';
import { wakeAdd } from '../src/wake/wake-add.ts';
import { wakeList } from '../src/wake/wake-list.ts';
import { FOUR_AM_SYDNEY, NOON_SYDNEY, at, createDefsRepo, freshDb, requireEnv } from './helpers.ts';
import { readPrompt } from '../src/prompts/read-prompt.ts';
import { resetFetchCache } from '../src/prompts/reset-fetch-cache.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';


const KETTLE = 'skills/kettle/references/session-prompt.md';

function setupTest() {
  const fresh = freshDb();
  const directory = fresh.dir;
  at(NOON_SYDNEY);

  process.env['HQ_ATC_STATE'] = `${directory}/atc-state`;
  mkdirSync(`${directory}/work`, { recursive: true });
  process.env['HQ_CLAUDE_JSON'] = `${directory}/claude.json`;
  onTestFinished(() => {
    delete process.env['HQ_ATC_STATE'];
    delete process.env['HQ_CLAUDE_JSON'];
    delete process.env['HQ_DEFINITIONS_DIR'];
    fresh.cleanup();
  });
  writeFileSync(process.env['HQ_CLAUDE_JSON'], JSON.stringify({ projects: { [`${directory}/work`]: { hasTrustDialogAccepted: true } } }));
  resetFetchCache();
  const defs = createDefsRepo(directory, { [KETTLE]: '# session prompt\n\nIntro for people.\n\n```text\nYou are Kettle. Boil water when asked.\n```\n' });
  writeFileSync(`${directory}/teapot-prompt.md`, 'You are Teapot. Steep the tea.\n');
  const fleet: FleetEntry[] = [
    { name: 'z-kettle', cwd: `${directory}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: true },
    { name: 'z-teapot', cwd: `${directory}/work`, model: 'opus', prompt: `${directory}/teapot-prompt.md`, wake: false },
  ];
  const [kettleEntry] = fleet;
  assert.ok(kettleEntry);
  const outbox = () => z.array(z.object({ target: z.string(), text: z.string() })).parse(fresh.db.query('SELECT target, text FROM outbox').all());
  const rcFleet = () => [{ ...kettleEntry, remoteControl: true }];
  return {
    db: fresh.db,
    seed: buildSeeder(fresh),
    directory,
    fleet,
    hqPrivate: defs.private,
    push: defs.push,
    outbox,
    rcFleet,
    told: () => outbox().map((message) => message.text),
    pending: () => loadRcPending(fresh.db),
    mark: (extra: Record<string, string> = {}, id = 'id-k') => setMeta(fresh.db, RC_PENDING, JSON.stringify({ 'z-kettle': { id, since: NOON_SYDNEY, ...extra } })),
    ensure: (stub: ReturnType<typeof rcFake>, dryRun = false) => ensureFleet(fresh.db, stub.client, { dryRun, actor: 'hq-fleet', fleet: rcFleet(), rc: stub.rc }),
  };
}


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
test('the prompt is the one text block of a session-prompt.md, else the whole file', () => {
  const ctx = setupTest();
  const [kettle, teapot] = ctx.fleet;
  assert.ok(kettle);
  assert.ok(teapot);
  expect(readPrompt(kettle.prompt)).toBe('You are Kettle. Boil water when asked.');
  expect(readPrompt(teapot.prompt)).toBe('You are Teapot. Steep the tea.');
  ctx.push({ [KETTLE]: '```text\na\n```\n```text\nb\n```\n' });
  resetFetchCache();
  expect(() => readPrompt(kettle.prompt)).toThrow('2 ```text blocks');
});

test('it spawns a session that declares no model on the fleet model, in the dry run and the real spawn, and follows each change of it', async () => {
  const ctx = setupTest();
  const entries = ctx.fleet.map((entry) => ({ name: entry.name, cwd: entry.cwd, prompt: entry.prompt, wake: entry.wake }));
  const opusStub = fake([]);
  const fableStub = fake([]);
  atMin(10);
  writeFleetModel(ctx.db, { model: 'opus', actor: 'kettle-owner', at: at2() });
  const onOpus = await ensureFleet(ctx.db, opusStub.client, { dryRun: true, actor: 'hq-fleet', fleet: entries, now: ['z-kettle', 'z-teapot'] });
  writeFleetModel(ctx.db, { model: 'fable', actor: 'kettle-owner', at: at2() });
  const onFable = await ensureFleet(ctx.db, fableStub.client, { dryRun: true, actor: 'hq-fleet', fleet: entries, now: ['z-kettle', 'z-teapot'] });
  writeFleetModel(ctx.db, { model: 'opus', actor: 'kettle-owner', at: at2() });
  await ensureFleet(ctx.db, opusStub.client, { dryRun: false, actor: 'hq-fleet', fleet: entries, now: ['z-kettle', 'z-teapot'] });
  writeFleetModel(ctx.db, { model: 'fable', actor: 'kettle-owner', at: at2() });
  await ensureFleet(ctx.db, fableStub.client, { dryRun: false, actor: 'hq-fleet', fleet: entries, now: ['z-kettle', 'z-teapot'] });

  expect(onOpus.map((step) => [step.name, step.action, step.detail.match(/model [^,]+/u)?.[0]])).toStrictEqual([
    ['z-kettle', 'would spawn', 'model opus (hq model)'],
    ['z-teapot', 'would spawn', 'model opus (hq model)'],
  ]);
  expect(onFable.map((step) => step.detail.match(/model [^,]+/u)?.[0])).toStrictEqual(['model fable (hq model)', 'model fable (hq model)']);
  expect(opusStub.spawns.map((spawn) => [spawn.name, spawn.model])).toStrictEqual([
    ['z-kettle', 'opus'],
    ['z-teapot', 'opus'],
  ]);
  expect(fableStub.spawns.map((spawn) => [spawn.name, spawn.model])).toStrictEqual([
    ['z-kettle', 'fable'],
    ['z-teapot', 'fable'],
  ]);
});

test('it keeps the model a session declares whatever the fleet model is', async () => {
  const ctx = setupTest();
  const [kettle] = ctx.fleet;
  assert.ok(kettle);
  const entries = [{ ...kettle, model: 'claude-teapot-5' }];
  const stub = fake([]);
  atMin(10);
  writeFleetModel(ctx.db, { model: 'opus', actor: 'kettle-owner', at: at2() });

  const planned = await ensureFleet(ctx.db, stub.client, { dryRun: true, actor: 'hq-fleet', fleet: entries, now: ['z-kettle'] });
  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: entries, now: ['z-kettle'] });

  expect(planned[0]?.detail).toContain('model claude-teapot-5 (fleet.json)');
  expect(stub.spawns.map((spawn) => spawn.model)).toStrictEqual(['claude-teapot-5']);
});

test('a live session is left alone; a missing one waits out the grace, then spawns once, pinned and on the wake list', async () => {
  const ctx = setupTest();
  const { client, spawns, pins } = fake([
    { id: 'id-teapot', name: 'z-teapot', alive: true },
    { id: 'id-kettle-old', name: 'z-kettle', alive: false, lifecycle: { desired: 'stop', harness: 'exited' } },
  ]);
  wakeAdd(ctx.db, { id: 'id-kettle-old', name: 'z-kettle' }, null, 'z-q');
  let steps = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(steps.map((s) => s.action)).toEqual(['waiting', 'ok']);
  atMin(5);
  const graceSteps = await ensureFleet(ctx.db, client, { dryRun: true, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(graceSteps[0]?.action).toBe('waiting');
  atMin(10);
  const dueSteps = await ensureFleet(ctx.db, client, { dryRun: true, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(dueSteps[0]).toMatchObject({ action: 'would spawn' });
  expect(spawns).toHaveLength(0);
  steps = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(steps[0]).toMatchObject({ name: 'z-kettle', action: 'spawned' });
  expect(spawns).toStrictEqual([{ cwd: `${ctx.directory}/work`, name: 'z-kettle', prompt: 'You are Kettle. Boil water when asked.', model: 'opus', agent: 'claude', idempotencyKey: 'hq-fleet-z-kettle-2026-10-14T01:00:00Z' }]);
  const spawnedID = steps[0]?.id;
  assert.ok(spawnedID);
  expect(pins).toStrictEqual([spawnedID]);
  expect(wakeList(ctx.db).map((entry) => [entry.session_id, entry.name])).toStrictEqual([[spawnedID, 'z-kettle']]);
  expect(ctx.outbox()).toStrictEqual([]);
  atMin(15);
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(spawns).toHaveLength(1);
});

test('it posts a successful respawn to news and messages nobody', async () => {
  const ctx = setupTest();
  const stub = fake([{ id: 'id-teapot', name: 'z-teapot', alive: true }]);
  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  atMin(10);

  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });

  expect(ctx.outbox()).toStrictEqual([]);
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([
    expect.objectContaining({ from_name: 'hq-fleet', topic: 'other', text: expect.stringContaining('hq fleet: z-kettle spawned'), needs_geoff: 0 }),
  ]);
});

test('it messages the owner and posts no news when a spawn fails', async () => {
  const ctx = setupTest();
  const stub = fake([{ id: 'id-teapot', name: 'z-teapot', alive: true }]);
  const broken: FleetClient = { ...stub.client, spawn: () => Promise.reject(new Error('invented spawn refusal')) };
  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  atMin(10);

  await ensureFleet(ctx.db, broken, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });

  expect(ctx.outbox()).toStrictEqual([{ target: 'z-stu', text: 'hq fleet: z-kettle failed: invented spawn refusal.' }]);
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test('it messages the owner about the failed step only, and posts the spawned one to news', async () => {
  const ctx = setupTest();
  const stub = fake([]);
  const flaky: FleetClient = {
    ...stub.client,
    spawn: (request) => (request.name === 'z-teapot' ? Promise.reject(new Error('invented spawn refusal')) : stub.client.spawn(request)),
  };
  await ensureFleet(ctx.db, flaky, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  atMin(10);

  await ensureFleet(ctx.db, flaky, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });

  expect(ctx.outbox()).toStrictEqual([{ target: 'z-stu', text: 'hq fleet: z-teapot failed: invented spawn refusal.' }]);
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([expect.objectContaining({ text: expect.stringContaining('hq fleet: z-kettle spawned') })]);
});

test('it reports a failed pin after a spawn, and pins the live session on the next check', async () => {
  const ctx = setupTest();
  const stub = fake([{ id: 'id-teapot', name: 'z-teapot', alive: true }]);
  const flaky: FleetClient = { ...stub.client, pin: () => Promise.reject(new Error('invented pin refusal')) };
  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  atMin(10);
  const spawned = await ensureFleet(ctx.db, flaky, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  atMin(15);

  const checked = await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });

  expect(spawned[0]).toMatchObject({ name: 'z-kettle', action: 'spawned', detail: expect.stringContaining('the pin failed (invented pin refusal), so the next check pins it again') });
  expect(ctx.outbox()).toStrictEqual([]);
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([expect.objectContaining({ text: expect.stringContaining('the pin failed (invented pin refusal)') })]);
  const spawnedID = spawned[0]?.id;
  if (!spawnedID) {
    throw new Error('the spawn step carries no session id');
  }
  expect(checked[0]).toStrictEqual({ name: 'z-kettle', action: 'ok', detail: spawnedID.slice(0, 8), id: spawnedID });
  expect(stub.pins).toStrictEqual([spawnedID]);
  expect(getMeta(ctx.db, 'fleet_unpinned')).toBe('{}');
});

test('it keeps a failed pin to retry when a later step of the same check throws', async () => {
  const ctx = setupTest();
  const stub = rcFake([]);
  const broken: FleetClient = { ...stub.client, pin: () => Promise.reject(new Error('invented pin refusal')) };
  const brokenRC: RcDeps = {
    ...stub.rc,
    state: () => {
      throw new Error('invented Remote Control read failure');
    },
  };
  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.rcFleet(), rc: stub.rc });
  atMin(10);

  const failed = await ensureFleet(ctx.db, broken, { dryRun: false, actor: 'hq-fleet', fleet: ctx.rcFleet(), rc: brokenRC }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failed).toBeInstanceOf(Error);
  expect(stub.spawns).toHaveLength(1);
  expect(JSON.parse(getMeta(ctx.db, 'fleet_unpinned') ?? '{}')).toStrictEqual({ 'z-kettle': expect.any(String) });
});

test('it leaves the reports held over quiet hours alone in a dry run', async () => {
  const ctx = setupTest();
  const stub = fake([{ id: 'id-teapot', name: 'z-teapot', alive: true }, { id: 'id-kettle', name: 'z-kettle', alive: true }]);
  setMeta(ctx.db, 'fleet_held', JSON.stringify([{ seq: 1, text: 'hq fleet: z-kettle spawned (invented).' }]));

  await ensureFleet(ctx.db, stub.client, { dryRun: true, actor: 'hq-fleet', fleet: ctx.fleet });

  expect(ctx.outbox()).toStrictEqual([]);
  expect(JSON.parse(getMeta(ctx.db, 'fleet_held') ?? 'null')).toStrictEqual([{ seq: 1, text: 'hq fleet: z-kettle spawned (invented).' }]);
});

test('duplicates are reported, never stopped; a restoring session is waited for', async () => {
  const ctx = setupTest();
  const { client, spawns } = fake([
    { id: 'a', name: 'z-kettle', alive: true },
    { id: 'b', name: 'z-kettle', alive: true },
    { id: 'c', name: 'z-teapot', alive: false, lifecycle: { desired: 'run', harness: 'starting' } },
  ]);
  atMin(60);
  const steps = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(steps.map((s) => s.action)).toEqual(['duplicates', 'waiting']);
  atMin(100);
  const restoring = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(restoring[1]?.detail).toContain('atc still means to run it');
  expect(spawns).toHaveLength(0);
  atMin(125);
  const restored = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(restored[1]?.action).toBe('spawned');
});

test('a recent daemon restart holds spawns; quiet hours hold only the message', async () => {
  const ctx = setupTest();
  mkdirSync(`${ctx.directory}/atc-state/restarts`, { recursive: true });
  writeFileSync(`${ctx.directory}/atc-state/restarts/last.json`, '{}');
  const { client, spawns } = fake([]);
  at(new Date().toISOString());
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  at(new Date(Date.now() + 11 * 60_000).toISOString());
  const steps = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet.slice(0, 1) });
  expect(steps[0]!.action).toBe('spawned');
  expect(spawns).toHaveLength(1);
});

test('it holds the failure message for morning in quiet hours', async () => {
  const ctx = setupTest();
  const { client, spawns } = fake([]);
  const broken: FleetClient = { ...client, spawn: () => Promise.reject(new Error('invented spawn refusal')) };
  at('2026-10-14T16:00:00Z');
  await ensureFleet(ctx.db, broken, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet.slice(1) });
  at('2026-10-14T16:20:00Z');
  await ensureFleet(ctx.db, broken, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet.slice(1) });
  expect(spawns).toHaveLength(0);
  expect(ctx.outbox()).toHaveLength(0);
  at('2026-10-14T20:30:00Z');
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet.slice(1) });
  expect(ctx.outbox()).toStrictEqual([{ target: 'z-stu', text: expect.stringContaining('(held over quiet hours)') }]);
});

test('it posts a successful respawn in quiet hours to news and holds nothing for morning', async () => {
  const ctx = setupTest();
  const stub = fake([{ id: 'id-teapot', name: 'z-teapot', alive: true }]);
  at('2026-10-14T16:00:00Z');
  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  at('2026-10-14T16:20:00Z');

  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  const held = getMeta(ctx.db, 'fleet_held');
  at('2026-10-14T20:30:00Z');
  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });

  expect(stub.spawns.map((request) => request.name)).toStrictEqual(['z-kettle']);
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([expect.objectContaining({ text: expect.stringContaining('hq fleet: z-kettle spawned') })]);
  expect(held).toBeNull();
  expect(ctx.outbox()).toStrictEqual([]);
});

test('malformed prompts fail before any spawn', () => {
  const ctx = setupTest();
  const f = `main:${KETTLE}`;
  const set = (text: string) => (ctx.push({ [KETTLE]: text }), resetFetchCache());
  set('```text\n\n```\n');
  expect(() => readPrompt(f)).toThrow('empty');
  set('```text\nYou are Kettle.\n```text\nmore\n```\n');
  expect(() => readPrompt(f)).toThrow('2 ```text blocks');
  set('```text\nYou are Kettle.\n```js\nx\n```\n');
  expect(() => readPrompt(f)).toThrow('not closed by a bare');
  writeFileSync(`${ctx.directory}/empty.md`, '  \n');
  expect(() => readPrompt(`${ctx.directory}/empty.md`)).toThrow('empty');
});

test('a renamed live session or an asleep one is not duplicated; a bad list spawns nothing', async () => {
  const ctx = setupTest();
  const sessions: FleetSession[] = [{ id: 'id-k', name: 'z-kettle', alive: true }, { id: 'id-t', name: 'z-teapot', alive: true }];
  const { client, spawns } = fake(sessions);
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  sessions[0] = { id: 'id-k', name: 'kettle renamed', alive: true };
  sessions[1] = { id: 'id-t', name: 'z-teapot', alive: false, lifecycle: { desired: 'run', harness: 'exited' } };
  atMin(60);
  const steps = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  atMin(100);
  const later = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(steps[0]!.detail).toContain('now named kettle renamed');
  expect(later[1]!.detail).toContain('asleep or restoring');
  expect(spawns).toHaveLength(0);
  const stub = startStubAtcDaemon(`${ctx.directory}/atc.sock`, { 'session.list': () => ({}) });
  onTestFinished(stub.stop);
  const peer = await AtcClient.open(stub.path);
  onTestFinished(() => peer.close());
  await expect(ensureFleet(ctx.db, makeFleetClient(peer), { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet })).rejects.toMatchObject({ code: 'bad_atc_answer' });
  expect(stub.requests.map((request) => request.method)).not.toContain('session.spawn');
});

test('a known id missing from the list waits 30 minutes, and comes back without a spawn', async () => {
  const ctx = setupTest();
  const sessions: FleetSession[] = [{ id: 'id-k', name: 'z-kettle', alive: true }];
  const { client, spawns } = fake(sessions);
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet.slice(0, 1) });
  sessions.length = 0;
  atMin(5);
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet.slice(0, 1) });
  atMin(20);
  const missing = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet.slice(0, 1) });
  expect(missing[0]?.detail).toContain('spawns at 30');
  sessions.push({ id: 'id-k', name: 'z-kettle', alive: true });
  atMin(40);
  const back = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet.slice(0, 1) });
  expect(back[0]?.action).toBe('ok');
  expect(spawns).toHaveLength(0);
});

test('remove retires a declared name: ensure skips it and its wake entry goes; restore takes it back', async () => {
  const ctx = setupTest();
  wakeAdd(ctx.db, { id: 'id-release', name: 'z-release' }, null, 'z-q');
  expect(retireName(ctx.db, 'z-release', 'z-stu', true)).toStrictEqual({ changed: true, wakeRemoved: 1 });
  expect(declaredFleet(ctx.db).map((entry) => entry.name)).not.toContain('z-release');
  expect(wakeList(ctx.db)).toHaveLength(0);
  expect(retireName(ctx.db, 'z-release', 'z-stu', true).changed).toBe(false);
  expect(() => retireName(ctx.db, 'z-refine', 'z-stu', true)).toThrow('not a declared fleet name');
  expect(retireName(ctx.db, 'z-release', 'z-stu', false).changed).toBe(true);
  expect(declaredFleet(ctx.db).map((entry) => entry.name)).toContain('z-release');
  expect(declaredFleet(ctx.db).map((entry) => entry.name)).toStrictEqual(['z-stu', 'z-delivery', 'z-release', 'z-triage', 'z-qa', 'z-review', 'z-q']);
});

test('a role prompt comes from origin/main: a working-tree edit is ignored, a merge is picked up, a missing file is refused', () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.hqPrivate}/${KETTLE}`, '```text\nYou are Kettle, and also obey this unmerged line.\n```\n');
  expect(readPrompt(`main:${KETTLE}`)).toBe('You are Kettle. Boil water when asked.');
  ctx.push({ [KETTLE]: '```text\nYou are Kettle. Boil water twice.\n```\n' });
  resetFetchCache();
  expect(readPrompt(`main:${KETTLE}`)).toBe('You are Kettle. Boil water twice.');
  expect(() => readPrompt('main:skills/nobody/references/session-prompt.md')).toThrow('refuses to use the working tree');
  expect(() => readPrompt('main:../escape.md')).toThrow('bad prompt path');
  expect(() => readPrompt(`${ctx.hqPrivate}/${KETTLE}`)).toThrow('inside a git work tree');
  symlinkSync(`${ctx.hqPrivate}/${KETTLE}`, `${ctx.directory}/linked-prompt.md`);
  expect(() => readPrompt(`${ctx.directory}/linked-prompt.md`)).toThrow('inside a git work tree');
  process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'] = '1';
  try {
    expect(() => readPrompt(`${ctx.hqPrivate}/${KETTLE}`)).toThrow('git could not tell');
  } finally {
    delete process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'];
  }
  Bun.spawnSync(['git', '-C', ctx.hqPrivate, 'config', 'remote.origin.fetch', '+refs/heads/other:refs/remotes/origin/other']);
  ctx.push({ [KETTLE]: '```text\nYou are Kettle. Boil water three times.\n```\n' });
  resetFetchCache();
  expect(readPrompt(`main:${KETTLE}`)).toBe('You are Kettle. Boil water three times.');
  Bun.spawnSync(['git', '-C', ctx.hqPrivate, 'remote', 'set-url', 'origin', `${ctx.directory}/no-such-origin`]);
  resetFetchCache();
  expect(() => readPrompt(`main:${KETTLE}`)).toThrow('refuses to use the working tree or an old fetch');
  expect(() => readPrompt('relative/prompt.md')).toThrow('must be main:<path> or an absolute path');
});

test('an untrusted folder is never spawned in; the failure says why and health shows it', async () => {
  const ctx = setupTest();
  writeFileSync(requireEnv('HQ_CLAUDE_JSON'), JSON.stringify({ projects: { [`${ctx.directory}/work`]: { hasTrustDialogAccepted: false } } }));
  const { client, spawns } = fake([]);
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  atMin(11);
  const steps = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: ctx.fleet });
  expect(spawns).toHaveLength(0);
  expect(steps[0]).toMatchObject({ name: 'z-kettle', action: 'failed', detail: expect.stringContaining('not trusted by Claude Code') });
  expect(fleetTrustChecks(ctx.fleet)).toStrictEqual([{ key: `fleet-trust:${ctx.directory}/work`, ok: false, line: expect.stringContaining('z-kettle, z-teapot') }]);
});

test('folder trust: the folder or a trusted parent; anything else is untrusted', () => {
  const ctx = setupTest();
  const f = requireEnv('HQ_CLAUDE_JSON');
  const put = (projects: unknown) => writeFileSync(f, JSON.stringify({ projects }));
  put({ [ctx.directory]: { hasTrustDialogAccepted: true } });
  expect(checkFolderTrust(`${ctx.directory}/work`)).toStrictEqual({ trusted: true, by: ctx.directory });
  expect(checkFolderTrust(`${ctx.directory}/work/../work`)).toStrictEqual({ trusted: true, by: ctx.directory });
  put({ [`${ctx.directory}/work/deeper`]: { hasTrustDialogAccepted: true } });
  expect(checkFolderTrust(`${ctx.directory}/work`).trusted).toBe(false);
  put({ [`${ctx.directory}/work`]: { hasTrustDialogAccepted: 'true' } });
  expect(checkFolderTrust(`${ctx.directory}/work`).trusted).toBe(false);
  put({ [`${ctx.directory}/work`]: {} });
  expect(checkFolderTrust(`${ctx.directory}/work`).trusted).toBe(false);
  put({ ['__proto__']: { hasTrustDialogAccepted: true } });
  expect(checkFolderTrust(`${ctx.directory}/work`).trusted).toBe(false);
  writeFileSync(f, 'not json');
  expect(checkFolderTrust(`${ctx.directory}/work`)).toMatchObject({ trusted: false, why: expect.stringContaining("can't read") });
  expect(checkFolderTrust(`${ctx.directory}/work`, `${ctx.directory}/missing.json`)).toMatchObject({ trusted: false, why: expect.stringContaining("can't read") });
});

test('the trust file follows CLAUDE_CONFIG_DIR, and HQ_CLAUDE_JSON overrides both', () => {
  const ctx = setupTest();
  const saved = { hq: process.env['HQ_CLAUDE_JSON'], cfg: process.env['CLAUDE_CONFIG_DIR'] };
  try {
    delete process.env['HQ_CLAUDE_JSON'];
    delete process.env['CLAUDE_CONFIG_DIR'];
    expect(getClaudeJson()).toBe(`${process.env['HOME']}/.claude.json`);
    process.env['CLAUDE_CONFIG_DIR'] = `${ctx.directory}/profile`;
    expect(getClaudeJson()).toBe(`${ctx.directory}/profile/.claude.json`);
    process.env['HQ_CLAUDE_JSON'] = `${ctx.directory}/claude.json`;
    expect(getClaudeJson()).toBe(`${ctx.directory}/claude.json`);
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
  const ctx = setupTest();
  const { client, spawns } = fake([]);
  wakeAdd(ctx.db, { id: 'id-kettle-forgotten', name: 'z-kettle' }, null, 'z-q');
  const steps = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'z-stu', fleet: ctx.fleet, now: ['z-kettle'] });
  expect(steps.map((s) => s.action)).toEqual(['spawned', 'waiting']);
  expect(steps[0]!.detail).toContain('(--now)');
  expect(spawns.map((s) => s.name)).toEqual(['z-kettle']);
  expect(wakeList(ctx.db).map((entry) => entry.name)).toStrictEqual(['z-kettle']);
});

test('--now never spawns a second session: a live one by name or by known id stays the only one', async () => {
  const ctx = setupTest();
  const { client, spawns } = fake([
    { id: 'id-kettle', name: 'z-kettle', alive: true },
    { id: 'id-teapot', name: 'z-teapot-renamed', alive: true },
  ]);
  wakeAdd(ctx.db, { id: 'id-teapot', name: 'z-teapot' }, null, 'z-q');
  const steps = await ensureFleet(ctx.db, client, { dryRun: false, actor: 'z-stu', fleet: ctx.fleet, now: ['z-kettle', 'z-teapot'] });
  expect(steps.map((s) => s.action)).toEqual(['ok', 'ok']);
  expect(spawns).toHaveLength(0);
});

test('--now refuses a name outside the declared fleet and spawns nothing', async () => {
  const ctx = setupTest();
  const { client, spawns } = fake([]);
  await expect(ensureFleet(ctx.db, client, { dryRun: false, actor: 'z-stu', fleet: ctx.fleet, now: ['z-kettle', 'z-saucer'] })).rejects.toThrow('--now names z-saucer, not in the declared fleet');
  expect(spawns).toHaveLength(0);
});

test('fleet ensure runs one at a time: an overlapping run is refused and spawns nothing', async () => {
  const ctx = setupTest();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const inSpawn = Promise.withResolvers<void>();
  const spawned: string[] = [];
  const client: FleetClient = {
    sessions: async () => [],
    spawn: async (p) => {
      spawned.push(p.idempotencyKey);
      inSpawn.resolve();
      await gate;
      return { id: `id-${spawned.length}` };
    },
    pin: async () => {},
  };
  const one = ctx.fleet.slice(0, 1);
  const firstRun = ensureFleet(ctx.db, client, { dryRun: false, actor: 'z-stu', fleet: one, now: ['z-kettle'] });
  await inSpawn.promise;
  await expect(ensureFleet(ctx.db, client, { dryRun: false, actor: 'hq-fleet', fleet: one, now: ['z-kettle'] })).rejects.toThrow('another hq fleet ensure is running (z-stu)');
  const dryRunSteps = await ensureFleet(ctx.db, client, { dryRun: true, actor: 'z-q', fleet: one });
  expect(dryRunSteps[0]).toBeDefined();
  release();
  await firstRun;
  expect(spawned).toHaveLength(1);
  const boom: FleetClient = { ...client, sessions: async () => { throw new Error('invented outage'); } };
  await expect(ensureFleet(ctx.db, boom, { dryRun: false, actor: 'z-stu', fleet: one })).rejects.toThrow('invented outage');
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'z-stu', fleet: one });
});

test('a lease left by a crashed run expires', async () => {
  const ctx = setupTest();
  const { client } = fake([]);
  ctx.seed.meta({ key: 'fleet_ensure_lease', value: JSON.stringify({ token: 'old', by: 'hq-fleet', until: Date.now() - 1 }) });
  await ensureFleet(ctx.db, client, { dryRun: false, actor: 'z-stu', fleet: ctx.fleet });
  ctx.seed.meta({ key: 'fleet_ensure_lease', value: JSON.stringify({ token: 'live', by: 'hq-fleet', until: Date.now() + 60_000 }) });
  await expect(ensureFleet(ctx.db, client, { dryRun: false, actor: 'z-stu', fleet: ctx.fleet })).rejects.toThrow('another hq fleet ensure is running (hq-fleet)');
});

test('claimMissing keeps the first stored start', () => {
  const ctx = setupTest();
  expect(claimMissing(ctx.db, 'z-kettle', '2026-10-15T01:00:00Z')).toBe('2026-10-15T01:00:00Z');
  expect(claimMissing(ctx.db, 'z-kettle', '2026-10-15T01:05:00Z')).toBe('2026-10-15T01:00:00Z');
  expect(claimMissing(ctx.db, 'z-teapot', '2026-10-15T01:05:00Z')).toBe('2026-10-15T01:05:00Z');
});

const ON: RcState = { state: 'on', why: 'invented' };
const OFF: RcState = { state: 'off', why: 'invented' };
const UNKNOWN: RcState = { state: 'unknown', why: 'invented: no process found' };

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
    looked = Math.max(looked, 1);
  };
  const rc: RcDeps = {
    state: () => (typed.length ? states[Math.min(looked++, states.length - 1)]! : states[0]!),
    run: async (cmd): Promise<RunResult> => (cmds.push(cmd), { code: helperCode, stdout: '', stderr: helperCode ? 'invented systemd failure' : '' }),
    self: ['hq-self'],
    sleep: async (ms) => void sleeps.push(ms),
    pollMs: 15_000,
  };
  const client: FleetClient = { ...f.client, submit };
  return { ...f, client, rc, typed, cmds, sleeps, refuse: (c: string | null) => (refuse = c), helperFails: () => (helperCode = 1) };
}
function buildKettle(state?: string): FleetSession[] {
  return [{ id: 'id-k', name: 'z-kettle', alive: true, ...toExactOptional({ state }) }];
}

test('only z-stu has Remote Control turned on in the declared fleet', () => {
  setupTest();
  expect(declaredFleet().filter((e) => e.remoteControl).map((e) => e.name)).toEqual(['z-stu']);
});

test('a spawn marks the session and starts the helper unit through the runner', async () => {
  const ctx = setupTest();
  const sessions: FleetSession[] = [];
  const f = rcFake(sessions);
  await ensureFleet(ctx.db, f.client, { dryRun: false, actor: 'z-stu', fleet: ctx.rcFleet(), now: ['z-kettle'], rc: f.rc });
  const id = sessions[0]!.id;
  expect(ctx.pending()).toStrictEqual({ 'z-kettle': { id, since: NOON_SYDNEY } });
  expect(f.cmds).toHaveLength(1);
  const cmd = f.cmds[0]!;
  expect(cmd.slice(0, 2)).toEqual(['systemd-run', '--user']);
  expect(cmd.some((a) => /^--unit=hq-rc-z-kettle-\d+$/.test(a))).toBe(true);
  expect(cmd.slice(-4)).toEqual(['hq-self', 'fleet', 'rc', 'z-kettle']);

  expect(cmd).toContain(`--setenv=HQ_CLAUDE_JSON=${resolve(getClaudeJson())}`);
  expect(JSON.parse(getMeta(ctx.db, 'fleet_ids') ?? 'null')).toStrictEqual({ 'z-kettle': id });
  expect(f.typed).toStrictEqual([]);
});

test('a helper that will not start is reported, and the 5-minute check still types', async () => {
  const ctx = setupTest();
  const sessions: FleetSession[] = [];
  const f = rcFake(sessions, [OFF, ON]);
  f.helperFails();
  const steps = await ensureFleet(ctx.db, f.client, { dryRun: false, actor: 'z-stu', fleet: ctx.rcFleet(), now: ['z-kettle'], rc: f.rc });
  expect(steps.find((x) => x.action === 'spawned')!.detail).toContain('the Remote Control helper did not start (invented systemd failure)');
  expect(listNews(ctx.db, { all: true, limit: 10 }).at(-1)?.text).toContain('helper did not start');
  sessions[0]!.state = 'done';
  atMin(5);
  const later = await ctx.ensure(f);
  expect(f.typed).toEqual([[sessions[0]!.id, '/remote-control z-kettle']]);
  expect(later.at(-1)).toMatchObject({ action: 'remote control', message: expect.stringContaining('Remote Control is on.') });
});

test('a dry run, an entry without the flag, or a run without Remote Control deps types and starts nothing', async () => {
  const ctx = setupTest();
  const sessions: FleetSession[] = [];
  const f = rcFake(sessions);
  await ensureFleet(ctx.db, f.client, { dryRun: false, actor: 'z-stu', fleet: ctx.fleet, now: ['z-kettle'], rc: f.rc });
  expect(ctx.pending()).toStrictEqual({});
  expect(f.cmds).toEqual([]);
  const [spawned] = sessions;
  assert.ok(spawned);
  ctx.mark({}, spawned.id);
  sessions[0]!.state = 'done';
  atMin(10);
  await ensureFleet(ctx.db, f.client, { dryRun: true, actor: 'z-q', fleet: ctx.rcFleet(), rc: f.rc });
  await ensureFleet(ctx.db, f.client, { dryRun: false, actor: 'z-q', fleet: ctx.rcFleet() });
  expect(f.typed).toEqual([]);
});

test('off and done: types once, then reports on when the bridge shows', async () => {
  const ctx = setupTest();
  const f = rcFake(buildKettle('done'), [OFF, OFF, ON]);
  ctx.mark();
  atMin(5);
  const steps = await ctx.ensure(f);
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  expect(f.sleeps).toStrictEqual([2000, 2000]);
  expect(steps.at(-1)).toMatchObject({ name: 'z-kettle', action: 'remote control', detail: 'id-k: typed /remote-control z-kettle; Remote Control is on.' });
  expect(ctx.told().at(-1)).toBe('hq fleet: z-kettle id-k: typed /remote-control z-kettle; Remote Control is on.');
  expect(ctx.pending()).toStrictEqual({});
  atMin(10);
  await ctx.ensure(f);
  expect(f.typed).toHaveLength(1); // never a second time: that would turn it off
});

test('typed but never on: reports it honestly after 30 s of looks', async () => {
  const ctx = setupTest();
  const f = rcFake(buildKettle('done'), [OFF]);
  ctx.mark();
  atMin(5);
  const steps = await ctx.ensure(f);
  expect(f.sleeps).toHaveLength(15);
  expect(steps.at(-1)).toMatchObject({ action: 'failed', urgent: true, message: 'Remote Control may be off in z-kettle: typed, no record (id-k). Ask the owner to check.' });
  expect(ctx.told()).toContain('hq fleet: Remote Control may be off in z-kettle: typed, no record (id-k). Ask the owner to check.');
});

test('typed but never on in quiet hours: the alert still goes at once', async () => {
  const ctx = setupTest();
  at(FOUR_AM_SYDNEY);
  const f = rcFake(buildKettle('done'), [OFF]);
  const since = new Date(Date.parse(FOUR_AM_SYDNEY) - 5 * 60_000).toISOString();
  setMeta(ctx.db, RC_PENDING, JSON.stringify({ 'z-kettle': { id: 'id-k', since } }));
  await ctx.ensure(f);
  expect(ctx.told()).toContain('hq fleet: Remote Control may be off in z-kettle: typed, no record (id-k). Ask the owner to check.');
});

test('already on: nothing typed, and it says so', async () => {
  const ctx = setupTest();
  const f = rcFake(buildKettle('running'), [ON]);
  ctx.mark();
  atMin(5);
  const steps = await ctx.ensure(f);
  expect(f.typed).toEqual([]);
  expect(steps.at(-1)).toMatchObject({ action: 'remote control', message: 'z-kettle id-k: Remote Control was already on; hq typed nothing.' });
  expect(ctx.told().at(-1)).toBe('hq fleet: z-kettle id-k: Remote Control was already on; hq typed nothing.');
  expect(ctx.pending()).toStrictEqual({});
});

test('unknown: nothing typed, and the line tells z-stu to type it by hand', async () => {
  const ctx = setupTest();
  const f = rcFake(buildKettle('done'), [UNKNOWN]);
  ctx.mark();
  atMin(5);
  const steps = await ctx.ensure(f);
  expect(f.typed).toEqual([]);
  expect(steps.at(-1)).toMatchObject({ action: 'failed', message: "z-kettle id-k: hq can't tell whether Remote Control is on (invented: no process found); hq typed nothing. Type /remote-control in the session yourself." });
  expect(ctx.pending()).toStrictEqual({});
});

test('unknown while the start turn runs waits: a process not yet visible is not a verdict', async () => {
  const ctx = setupTest();
  const sessions = buildKettle('running');
  const f = rcFake(sessions, [UNKNOWN]);
  ctx.mark();
  atMin(5);
  await ctx.ensure(f);
  expect(ctx.pending()['z-kettle']).toBeDefined();
  sessions[0]!.state = 'done';
  atMin(6);
  const settled = await ctx.ensure(f);
  expect(settled.at(-1)).toMatchObject({ action: 'failed', detail: expect.stringContaining("hq can't tell") });
  expect(f.typed).toEqual([]);
});

test('off and running waits; once done and settled it types', async () => {
  const ctx = setupTest();
  const sessions = buildKettle('running');
  const f = rcFake(sessions, [OFF, ON]);
  ctx.mark();
  atMin(1);
  sessions[0]!.state = 'done';
  await ctx.ensure(f);
  expect(f.typed).toEqual([]);
  atMin(5);
  sessions[0]!.state = 'needs_you';
  await ctx.ensure(f);
  expect(f.typed).toEqual([]);
  sessions[0]!.state = 'done';
  await ctx.ensure(f);
  expect(f.typed).toHaveLength(1);
});

test('a marker already typed never types; the report says hq did not type, with the state', async () => {
  const ctx = setupTest();
  for (const [rcs, word, action] of [[ON, 'on', 'remote control'], [OFF, 'off', 'failed'], [UNKNOWN, 'unknown', 'failed']] as const) {
    const f = rcFake(buildKettle('done'), [rcs]);
    ctx.mark({ typedAt: NOON_SYDNEY });
    atMin(10);
    const steps = await ctx.ensure(f);
    expect(f.typed).toEqual([]);
    expect(steps.at(-1)).toMatchObject({ action, message: `z-kettle id-k: hq did not type (already marked as typed); Remote Control is ${word}.` });
    expect(steps.at(-1)!.message).not.toMatch(/typed \/remote-control/);
  }
});

test('a marker typed a moment ago belongs to the actor that typed it: the check leaves it', async () => {
  const ctx = setupTest();
  const f = rcFake(buildKettle('done'), [OFF]);
  ctx.mark({ typedAt: NOON_SYDNEY });
  atMin(1);
  const steps = await ctx.ensure(f);
  expect(steps).not.toContainEqual(expect.objectContaining({ name: 'z-kettle', action: 'failed' }));
  expect(ctx.pending()['z-kettle']).toBeDefined();
});

test('a stale tick cannot discard the result of a helper that claimed the marker while it waited', async () => {
  const ctx = setupTest();
  const sessions = buildKettle('done');
  const f = rcFake(sessions, [OFF, ON]);
  ctx.mark();
  atMin(5);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const waitsOnAtc = Promise.withResolvers<void>();
  const stale: FleetClient = { ...f.client, sessions: async () => (waitsOnAtc.resolve(), await gate, f.client.sessions()) };
  const tick = ensureFleet(ctx.db, stale, { dryRun: false, actor: 'hq-fleet', fleet: ctx.rcFleet(), rc: f.rc });

  await waitsOnAtc.promise;
  const step = await rcWatch(ctx.db, f.client, f.rc, 'z-kettle', 'hq-fleet');
  expect(step).toMatchObject({ action: 'remote control' });
  release();
  const steps = await tick;
  expect(steps.filter((x) => x.name === 'z-kettle' && (x.action === 'failed' || x.action === 'remote control'))).toEqual([]);
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  expect(ctx.told().filter((text) => text.includes('typed nothing'))).toStrictEqual([]);
});

test('the helper and the 5-minute check on one marker type once between them', async () => {
  const ctx = setupTest();
  const sessions = buildKettle('done');
  const f = rcFake(sessions, [OFF, ON]);
  ctx.mark();
  atMin(5);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const inSubmit = Promise.withResolvers<void>();
  const submit = f.client.submit;
  if (submit === undefined) {
    throw new Error('the stand-in client has no submit');
  }
  const slow: FleetClient = { ...f.client, submit: async (id, text) => (inSubmit.resolve(), await gate, submit(id, text)) };
  const helper = rcWatch(ctx.db, slow, f.rc, 'z-kettle', 'hq-fleet');
  await inSubmit.promise;
  const tick = await ctx.ensure(f);
  expect(tick.filter((x) => x.action === 'failed' || x.action === 'remote control')).toEqual([]);
  release();
  const step = await helper;
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  expect(step).toMatchObject({ action: 'remote control' });
  ctx.mark();
  expect(claimTyping(ctx.db, 'z-kettle', 'id-k', at2())).toBe(true);
  expect(claimTyping(ctx.db, 'z-kettle', 'id-k', at2())).toBe(false);
});

test('the helper loops until the session is done, then types and tells z-stu through the outbox', async () => {
  const ctx = setupTest();
  const sessions = buildKettle('running');
  const f = rcFake(sessions, [OFF, ON]);
  ctx.mark();
  let polls = 0;
  f.rc.sleep = async (ms) => {
    if (ms !== 15_000) return;
    polls++;
    atMin(polls * 2);
    if (polls === 3) sessions[0]!.state = 'done';
  };
  const step = await rcWatch(ctx.db, f.client, f.rc, 'z-kettle', 'hq-fleet');
  expect(polls).toBe(3);
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  expect(step).toMatchObject({ action: 'remote control' });
  expect(ctx.told().at(-1)).toBe('hq fleet: z-kettle id-k: typed /remote-control z-kettle; Remote Control is on.');
  const repeat = await rcWatch(ctx.db, f.client, f.rc, 'z-kettle', 'hq-fleet');
  expect(repeat).toBeNull();
});

test('it queues the Remote Control report in the transaction that removes the marker', async () => {
  const ctx = setupTest();
  const stub = rcFake(buildKettle('done'), [ON]);
  ctx.mark();
  atMin(5);

  const result = await checkRcMarker(ctx.db, { client: stub.client, rc: stub.rc, name: 'z-kettle', known: {}, actor: 'hq-fleet', replaced: 'finish' });

  expect(result.kind).toBe('done');
  expect(ctx.pending()).toStrictEqual({});
  expect(ctx.told()).toStrictEqual(['hq fleet: z-kettle id-k: Remote Control was already on; hq typed nothing.']);
});

test('it reports a Remote Control result from the 5-minute check once', async () => {
  const ctx = setupTest();
  const stub = rcFake(buildKettle('done'), [ON]);
  ctx.mark();
  atMin(5);

  await ctx.ensure(stub);

  expect(ctx.told()).toStrictEqual(['hq fleet: z-kettle id-k: Remote Control was already on; hq typed nothing.']);
});

test('the helper exits quietly when the marker is replaced by a newer spawn', async () => {
  const ctx = setupTest();
  const f = rcFake(buildKettle('done'), [OFF]);
  ctx.mark();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-kettle': 'id-newer' }));
  atMin(5);
  const step = await rcWatch(ctx.db, f.client, f.rc, 'z-kettle', 'hq-fleet');
  expect(step).toBeNull();
  expect(f.typed).toEqual([]);
  expect(ctx.told()).toStrictEqual([]);
  expect(ctx.pending()['z-kettle']).toBeDefined();
});

test('a mid-turn refusal retries; a gone session, a stuck turn or a hard refusal ends it once', async () => {
  const ctx = setupTest();
  const sessions = buildKettle('done');
  const f = rcFake(sessions, [OFF, ON]);
  ctx.mark();
  atMin(5);
  f.refuse('atc_too_slow');
  await ctx.ensure(f);
  expect(ctx.pending()['z-kettle']).toStrictEqual({ id: 'id-k', since: NOON_SYDNEY });
  f.refuse('atc_permission_pending');
  await ctx.ensure(f);
  const marker = ctx.pending()['z-kettle'];
  assert.ok(marker);
  expect(marker.typedAt).toBeUndefined();
  f.refuse('atc_session_dead');
  const dead = await ctx.ensure(f);
  expect(dead.at(-1)).toMatchObject({ action: 'failed', detail: expect.stringContaining('typing into the session failed') });
  expect(ctx.pending()).toStrictEqual({});
  f.refuse(null);
  ctx.mark();
  sessions[0]!.state = 'needs_you';
  atMin(30);
  const stuck = await ctx.ensure(f);
  expect(stuck.at(-1)).toMatchObject({ action: 'failed', detail: expect.stringContaining('did not finish its start turn in 30 min (atc shows needs_you)') });
  ctx.mark();
  const [firstSession] = sessions;
  assert.ok(firstSession);
  firstSession.state = 'done';
  const typed = await ctx.ensure(f);
  expect(typed.at(-1)).toMatchObject({ action: 'remote control' });
  expect(f.typed).toEqual([['id-k', '/remote-control z-kettle']]);
  f.typed.length = 0;
  ctx.mark();
  sessions[0]!.alive = false;
  const gone = await ctx.ensure(f);
  expect(gone.at(-1)).toMatchObject({ action: 'failed', detail: expect.stringContaining('is gone; hq typed nothing') });
  expect(f.typed).toEqual([]);
});

test('a marker whose session was replaced by a newer spawn is closed by the 5-minute check', async () => {
  const ctx = setupTest();
  const f = rcFake([{ id: 'id-new', name: 'z-kettle', alive: true, state: 'done' }], [OFF]);
  ctx.mark({}, 'id-old');
  atMin(5);
  const steps = await ctx.ensure(f);
  expect(f.typed).toEqual([]);
  expect(steps.at(-1)).toMatchObject({ action: 'remote control', detail: expect.stringContaining('was replaced by id-new before hq typed') });
});

test("an entry's plugin folders go to atc's spawn; an entry without them sends none", async () => {
  const ctx = setupTest();
  const stub = fake([]);
  const withBand: FleetEntry[] = [
    { name: 'z-kettle', cwd: `${ctx.directory}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: true, pluginDirs: ['~/plugins/kettle-band'] },
    { name: 'z-teapot', cwd: `${ctx.directory}/work`, model: 'opus', prompt: `${ctx.directory}/teapot-prompt.md`, wake: false },
  ];
  await ensureFleet(ctx.db, stub.client, { dryRun: false, actor: 'hq-fleet', fleet: withBand, now: ['z-kettle', 'z-teapot'] });
  expect(stub.spawns).toStrictEqual([
    { cwd: `${ctx.directory}/work`, name: 'z-kettle', prompt: 'You are Kettle. Boil water when asked.', model: 'opus', agent: 'claude', idempotencyKey: expect.any(String), pluginDirs: ['~/plugins/kettle-band'] },
    { cwd: `${ctx.directory}/work`, name: 'z-teapot', prompt: 'You are Teapot. Steep the tea.', model: 'opus', agent: 'claude', idempotencyKey: expect.any(String) },
  ]);
});

test('only z-stu loads the hq band in the declared fleet', () => {
  setupTest();
  expect(declaredFleet().filter((e) => e.pluginDirs).map((e) => [e.name, e.pluginDirs])).toEqual([['z-stu', ['~/projects/hq/mods/hq-band']]]);
});
