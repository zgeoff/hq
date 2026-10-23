import { afterEach, beforeEach, expect, test } from 'bun:test';
import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import { launchDetached } from '../src/restart/launch-detached.ts';
import { restartHere } from '../src/restart/restart-here.ts';
import { restartQuiet } from '../src/restart/restart-quiet.ts';
import { settleRestores } from '../src/restart/settle-restores.ts';
import type { RunOpts, Runner } from '../src/runner/types.ts';
import { parseWakeFile } from '../src/wake/parse-wake-file.ts';
import { planWake } from '../src/wake/plan-wake.ts';
import { runWake } from '../src/wake/run-wake.ts';
import type { RestartRecord } from '../src/wake/types.ts';
import { wakeAdd } from '../src/wake/wake-add.ts';
import { wakeList } from '../src/wake/wake-list.ts';
import { wakeRemove } from '../src/wake/wake-remove.ts';
import type { FakeAtc } from './helpers.ts';
import { NOON_SYDNEY, at, fakeAtc, freshDb } from './helpers.ts';
import { resetFetchCache } from '../src/prompts/reset-fetch-cache.ts';

let db: Database;
let dir: string;
let cleanup: () => void;
let atc: FakeAtc | null = null;
const home = process.env['HOME'];

const last: RestartRecord = { runID: 'run-1', code: 0, restored: 4, total: 4, interrupted: [{ id: 'id-helper', name: 'helper' }] };
const sessions = [
  { id: 'id-delivery', name: 'z-delivery', alive: true, state: 'done' },
  { id: 'id-helper', name: 'helper', alive: true, state: 'done' },
  { id: 'id-stu', name: 'z-stu', alive: true, state: 'done' },
  { id: 'id-gone', name: 'z-old', alive: false, state: 'exited' },
];

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  at(NOON_SYDNEY);
  process.env['HQ_ATC_STATE'] = dir;
  process.env['XDG_STATE_HOME'] = `${dir}/state`;
  // Every prompt path inside the test dir: a wake must never write the real one.
  process.env['HQ_DEFINITIONS_DIR'] = `${dir}/defs`;
  resetFetchCache();
  mkdirSync(`${dir}/restarts`, { recursive: true });
});
afterEach(() => {
  delete process.env['HQ_DEFINITIONS_DIR'];
  delete process.env['XDG_STATE_HOME'];
  process.env['HOME'] = home;
  atc?.stop();
  atc = null;
  cleanup();
});

test('reads the old wake-sessions.txt format', () => {
  expect(parseWakeFile('# comment\nid-a z-triage\n\nid-b  z-stu  extra words\n')).toEqual([
    { id: 'id-a', name: 'z-triage' },
    { id: 'id-b', name: 'z-stu extra words' },
  ]);
});

test('plans the orchestrator, the interrupted, then the live listed; once each', () => {
  const plan = planWake(last, sessions, [{ id: 'id-stu', name: 'z-stu' }, { id: 'id-helper', name: 'helper' }, { id: 'id-gone', name: 'z-old' }], 'z-delivery');
  expect(plan.messages.map((m) => [m.name, m.reason])).toEqual([
    ['z-delivery', 'orchestrator'],
    ['helper', 'interrupted'],
    ['z-stu', 'background'],
  ]);
  const [first] = plan.messages;
  expect(first?.text).toContain('Read your start prompt as it stands on main and your state file again, re-arm the event watch');
  expect(first?.text).not.toContain('/loop');
  expect(first?.text).not.toContain('CronList');
  for (const m of plan.messages.slice(1)) expect(m.text).toContain("check CronList; when its jobs are gone, re-arm it from your start prompt's /loop line.");
  expect(plan.messages.map((m) => m.idempotencyKey)).toEqual(['wake-run-1-id-delivery', 'wake-run-1-id-helper', 'wake-run-1-id-stu']);
  expect(plan.skipped).toEqual([{ session: 'id-gone', name: 'z-old', why: 'not alive' }]);
});

test('a missing orchestrator is reported, not guessed', () => {
  const plan = planWake(last, sessions.filter((session) => session.name !== 'z-delivery'), [], 'z-delivery');
  expect(plan.skipped[0]).toMatchObject({ name: 'z-delivery', why: 'no live session by that name' });
});

test('wake list add, update, remove', () => {
  expect(wakeAdd(db, { id: 'id-stu', name: 'z-stu' }, null, 'z-q').result).toBe('added');
  expect(wakeAdd(db, { id: 'id-stu', name: 'z-stu' }, null, 'z-q').result).toBe('noop');
  expect(wakeAdd(db, { id: 'id-stu', name: 'z-stu' }, 'main thread', 'z-q').result).toBe('updated');
  expect(wakeRemove(db, 'z-stu', 'z-q').session_id).toBe('id-stu');
  expect(wakeList(db)).toEqual([]);
});

test('runWake sends through atc with the old keys; a second run sends nothing new', async () => {
  await Bun.write(`${dir}/restarts/last.json`, JSON.stringify(last));
  atc = fakeAtc(dir, sessions);
  wakeAdd(db, { id: 'id-stu', name: 'z-stu' }, null, 'z-q');
  const r = await runWake(db, { dryRun: false, waitMs: 0, actor: 'z-q' });
  expect(r.sent.map((s) => s.name)).toEqual(['z-delivery', 'helper', 'z-stu']);
  expect(atc.sent.every((m) => m.from === 'orchestrator')).toBe(true);
  await runWake(db, { dryRun: false, waitMs: 0, actor: 'z-q' });
  expect(atc.sent).toHaveLength(3);
});

test('a dry run sends nothing', async () => {
  await Bun.write(`${dir}/restarts/last.json`, JSON.stringify(last));
  atc = fakeAtc(dir, sessions);
  const r = await runWake(db, { dryRun: true, waitMs: 0, actor: 'z-q' });
  expect(r.sent).toHaveLength(2);
  expect(atc.sent).toHaveLength(0);
});

// A fake runner that records commands and plays scripted exit codes.
function fakeRunner(codes: Record<string, number> = {}): { run: Runner; calls: { cmd: string[]; opts?: RunOpts }[] } {
  const calls: { cmd: string[]; opts?: RunOpts }[] = [];
  const run: Runner = async (cmd, opts) => {
    calls.push(toExactOptional({ cmd, opts }));
    return { code: codes[cmd.join(' ')] ?? 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

test('restart refuses 23:00-08:00 Sydney unless forced', async () => {
  expect(restartQuiet(new Date('2026-10-14T13:00:00Z'))).toBe(true); // 00:00 Sydney
  expect(restartQuiet(new Date(NOON_SYDNEY))).toBe(false);
  at('2026-10-14T13:00:00Z');
  const { run, calls } = fakeRunner();
  await expect(launchDetached(run, { force: false })).rejects.toThrow('23:00-08:00');
  expect(calls).toHaveLength(0);
  await launchDetached(run, { force: true });
  expect(calls).toHaveLength(1);
});

test('restart --here also refuses quiet hours unless forced', async () => {
  at('2026-10-14T13:00:00Z');
  const { run, calls } = fakeRunner();
  await expect(restartHere(db, run, 'z-q', false)).rejects.toThrow('23:00-08:00');
  expect(calls).toHaveLength(0);
});

test('restart launches itself detached, without the session env', async () => {
  process.env['HQ_LIVE'] = '1';
  process.env['ATC_SESSION_ID'] = 'id-me';
  const { run, calls } = fakeRunner();
  const r = await launchDetached(run, { force: false });
  delete process.env['ATC_SESSION_ID'];
  delete process.env['HQ_LIVE'];
  expect(calls[0]?.cmd).toContain('--setenv=HQ_LIVE=1');
  expect(calls[0]?.cmd.some((a) => a.startsWith('--setenv=HQ_DB='))).toBe(true);
  expect(calls[0]?.cmd.slice(0, 3)).toEqual(['systemd-run', '--user', `--unit=${r.unit}`]);
  expect(calls[0]?.cmd.slice(-3)).toEqual(['restart', '--here', '--force']);
  expect(calls[0]?.opts?.env?.['ATC_SESSION_ID']).toBeUndefined();
});

test('the detached half: a failed dry run stops before the restart', async () => {
  process.env['HQ_RESTART_LOG'] = `${dir}/r.log`;
  const { run, calls } = fakeRunner({ 'atc daemon restart --dry-run': 3 });
  const r = await restartHere(db, run, 'z-q', false);
  delete process.env['HQ_RESTART_LOG'];
  expect(calls.map((c) => c.cmd.join(' '))).toEqual(['atc daemon restart --dry-run']);
  expect(r.restartCode).toBe(-1);
  expect(await Bun.file(`${dir}/r.log`).text()).toContain('dry run failed (3): no restart');
});

test('the detached half writes its default log under hq\'s own state dir, and creates the dir', async () => {
  delete process.env['HQ_RESTART_LOG'];
  process.env['XDG_STATE_HOME'] = `${dir}/fresh-state`;
  const fake = fakeRunner({ 'atc daemon restart --dry-run': 3 }),
    r = await restartHere(db, fake.run, 'z-q', false),
    text = await Bun.file(r.log).text();
  expect(r.log).toStartWith(`${dir}/fresh-state/hq/hq-restart-`);
  expect(statSync(`${dir}/fresh-state/hq`).isDirectory()).toBe(true);
  expect(text).toContain('dry run failed (3): no restart');
});

test('the detached half: restart, then wake, all logged', async () => {
  process.env['HQ_RESTART_LOG'] = `${dir}/r.log`;
  await Bun.write(`${dir}/restarts/last.json`, JSON.stringify(last));
  atc = fakeAtc(dir, sessions);
  const { run, calls } = fakeRunner();
  const r = await restartHere(db, run, 'z-q', false);
  delete process.env['HQ_RESTART_LOG'];
  expect(calls.map((c) => c.cmd.join(' '))).toEqual(['atc daemon restart --dry-run', 'atc daemon restart']);
  expect(r.restartCode).toBe(0);
  expect(atc.sent).toHaveLength(2);
  const log = await Bun.file(`${dir}/r.log`).text();
  expect(log).toContain('messaged id-delivery z-delivery (orchestrator)');
  expect(log).toContain('== ');
});

test('slow restores: sessions that come up in time are late, the rest stay down', async () => {
  const failed = [
    { id: 'id-a', name: 'kettle', reason: 'listed in state running without a terminal: waiting to restore' },
    { id: 'id-b', name: 'teapot', reason: 'listed in state running without a terminal: waiting to restore' },
    { id: 'id-c', name: 'toaster', reason: 'no transcript' },
  ];
  let t = 0;
  let polls = 0;
  const list = async () => {
    polls++;
    return polls >= 3 ? [{ id: 'id-a', alive: true, lifecycle: { harness: 'running' } }, { id: 'id-b', alive: false }] : [{ id: 'id-a', alive: false }];
  };
  const r = await settleRestores(failed, list, { timeoutMs: 20_000, pollMs: 5_000, sleep: async (ms) => void (t += ms), clock: () => t });
  expect(r.late).toEqual([{ id: 'id-a', name: 'kettle' }]);
  expect(r.down.map((d) => d.name)).toEqual(['toaster', 'teapot']);
  expect(t).toBe(20_000);
});

test('the detached half: a restart that exits 1 on slow restores waits, then wakes', async () => {
  process.env['HQ_RESTART_LOG'] = `${dir}/r.log`;
  process.env['HQ_RESTORE_WAIT_MS'] = '0';
  await Bun.write(`${dir}/restarts/last.json`, JSON.stringify({ ...last, code: 1, failed: [{ id: 'id-helper', name: 'helper', reason: 'listed in state running without a terminal: waiting to restore' }] }));
  atc = fakeAtc(dir, sessions);
  const { run } = fakeRunner({ 'atc daemon restart': 1 });
  const r = await restartHere(db, run, 'z-q', false);
  delete process.env['HQ_RESTART_LOG'];
  delete process.env['HQ_RESTORE_WAIT_MS'];
  expect(r.settled).toEqual({ late: [{ id: 'id-helper', name: 'helper' }], down: [] });
  const log = await Bun.file(`${dir}/r.log`).text();
  expect(log).toContain('restored late: helper (id-helper)');
  expect(log).toContain('all 1 restored late: the restart is good');
  expect(log).toContain('messaged id-helper helper (interrupted)');
});

test('a bad restore wait falls back to 180 s; the wake keeps the report read after the restart', async () => {
  process.env['HQ_RESTART_LOG'] = `${dir}/r.log`;
  process.env['HQ_RESTORE_WAIT_MS'] = 'Infinity';
  await Bun.write(`${dir}/restarts/last.json`, JSON.stringify({ ...last, code: 1, failed: [{ id: 'id-helper', name: 'helper', reason: 'waiting to restore' }] }));
  atc = fakeAtc(dir, sessions);
  const { run } = fakeRunner({ 'atc daemon restart': 1 });
  const p = restartHere(db, run, 'z-q', false);
  await Bun.sleep(50);
  await Bun.write(`${dir}/restarts/last.json`, JSON.stringify({ runID: 'run-2', code: 0, restored: 0, total: 0 }));
  const r = await p;
  delete process.env['HQ_RESTART_LOG'];
  delete process.env['HQ_RESTORE_WAIT_MS'];
  expect(await Bun.file(`${dir}/r.log`).text()).toContain('waiting up to 180s');
  expect((r.wake as { runID: string }).runID).toBe('run-1');
});

test('the default restart log is under hq\'s own state dir, and the dir is created', async () => {
  process.env['HOME'] = dir;
  delete process.env['XDG_STATE_HOME'];
  const runner = fakeRunner(),
    started = await launchDetached(runner.run, { force: true });
  expect(started.log).toStartWith(`${dir}/.local/state/hq/hq-restart-`);
  expect(statSync(`${dir}/.local/state/hq`).isDirectory()).toBe(true);
});

test('XDG_STATE_HOME moves the restart log, and the dir is created', async () => {
  process.env['XDG_STATE_HOME'] = `${dir}/xdg-state`;
  const runner = fakeRunner(),
    started = await launchDetached(runner.run, { force: true });
  expect(started.log).toStartWith(`${dir}/xdg-state/hq/hq-restart-`);
  expect(statSync(`${dir}/xdg-state/hq`).isDirectory()).toBe(true);
});
