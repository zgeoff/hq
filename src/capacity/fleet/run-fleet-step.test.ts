import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slotUsage } from '../../../mocks/anthropic-handlers.ts';
import { freshDb } from '../../../test/helpers.ts';
import { addRun } from '../../runs/add-run.ts';
import type { RunResult, Runner } from '../../runner/types.ts';
import { readOptionalFile } from './read-optional-file.ts';
import { runFleetStep } from './run-fleet-step.ts';

function setupTest() {
  const fresh = freshDb();
  const directory = mkdtempSync(join(tmpdir(), 'hq-fleet-step-'));
  const path = join(directory, 'settings.local.json');

  onTestFinished(fresh.cleanup);
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));

  return { db: fresh.db, path };
}

test('it reads the slots when there is no read yet', async () => {
  const ctx = setupTest();
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: 'sk-ant-kettle-fleet-token-0042\n', stderr: '' }));

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  slotUsage.set('Bearer sk-ant-kettle-fleet-token-0042', { seven: { utilization: 0.1, reset: 1_792_400_000 } });

  const step = await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T00:00:00Z'), { force: false, signal: new AbortController().signal });

  expect(step.read?.kind).toBe('read');
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM slot_usage').get()).toStrictEqual({ total: 4 });
});

test('it reads no slot when the newest read is under 2 hours old', async () => {
  const ctx = setupTest();
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: 'sk-ant-kettle-fleet-token-0042\n', stderr: '' }));

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  slotUsage.set('Bearer sk-ant-kettle-fleet-token-0042', { seven: { utilization: 0.1, reset: 1_792_400_000 } });

  await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T00:00:00Z'), { force: false, signal: new AbortController().signal });
  const step = await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T01:59:00Z'), { force: false, signal: new AbortController().signal });

  expect(step.read).toBeNull();
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM slot_usage').get()).toStrictEqual({ total: 4 });
});

test('it reads the slots again when the newest read is 2 hours old', async () => {
  const ctx = setupTest();
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: 'sk-ant-kettle-fleet-token-0042\n', stderr: '' }));

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  slotUsage.set('Bearer sk-ant-kettle-fleet-token-0042', { seven: { utilization: 0.1, reset: 1_792_400_000 } });

  await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T00:00:00Z'), { force: false, signal: new AbortController().signal });
  const step = await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T02:00:00Z'), { force: false, signal: new AbortController().signal });

  expect(step.read?.kind).toBe('read');
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM slot_usage').get()).toStrictEqual({ total: 8 });
});

test('it reads the slots now when forced, whatever the age of the newest read', async () => {
  const ctx = setupTest();
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: 'sk-ant-kettle-fleet-token-0042\n', stderr: '' }));

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  slotUsage.set('Bearer sk-ant-kettle-fleet-token-0042', { seven: { utilization: 0.1, reset: 1_792_400_000 } });

  await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T00:00:00Z'), { force: false, signal: new AbortController().signal });
  const step = await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T00:05:00Z'), { force: true, signal: new AbortController().signal });

  expect(step.read?.kind).toBe('read');
});

test('it adds a news line for the forecast pause and leaks no token into it, the rows or the result', async () => {
  const ctx = setupTest();
  const tokens: Record<string, RunResult> = {
    'op://claude-slots/claude-setup-token-1/credential': { code: 0, stdout: 'sk-ant-kettle-slot-1\n', stderr: '' },
    'op://claude-slots/claude-setup-token-2/credential': { code: 0, stdout: 'sk-ant-kettle-slot-2\n', stderr: '' },
    'op://claude-slots/claude-setup-token-3/credential': { code: 0, stdout: 'sk-ant-kettle-slot-3\n', stderr: '' },
    'op://claude-slots/claude-setup-token-4/credential': { code: 0, stdout: 'sk-ant-kettle-slot-4\n', stderr: '' },
  };
  const run = mock<Runner>((cmd) => Promise.resolve(tokens[cmd[2] ?? ''] ?? { code: 1, stdout: '', stderr: 'invented: no such item' }));

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  slotUsage.set('Bearer sk-ant-kettle-slot-1', { seven: { utilization: 0.4, reset: 1_792_281_600 } });
  slotUsage.set('Bearer sk-ant-kettle-slot-2', { seven: { utilization: 0.96, reset: 1_792_324_800 } });
  slotUsage.set('Bearer sk-ant-kettle-slot-4', { seven: { utilization: 0.97, reset: 1_792_303_200 } });
  for (const [index, time] of ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].entries()) {
    ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at) VALUES (?, ?, ?, ?, ?, ?)').run(time, 'abcdef012345', 5, 38.5 + index * 0.5, null, '2026-10-18T00:00:00Z');
  }
  for (const issue of ['GEO-9901', 'GEO-9902']) {
    addRun(ctx.db, { issue, title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  }
  const step = await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T01:00:00Z'), { force: false, signal: new AbortController().signal });
  const everything = JSON.stringify([step, ctx.db.query('SELECT * FROM slot_usage').all(), ctx.db.query('SELECT * FROM news').all(), ctx.db.query('SELECT * FROM meta').all()]);

  expect(step.news).toBe(true);
  expect(ctx.db.query('SELECT text FROM news').all()).toStrictEqual([{ text: 'Fleet forecast: every Claude slot is at 95% from 16 Oct 08:00Z for 40.0 h at the current rate; a cap of 1 lane avoids it' }]);
  expect(everything).not.toInclude('sk-ant-kettle');
  expect(everything).not.toInclude('ops_kettle');
});

test('it stores no slot row and no news line when the step is aborted', async () => {
  const ctx = setupTest();
  const tokens: Record<string, RunResult> = {
    'op://claude-slots/claude-setup-token-1/credential': { code: 0, stdout: 'sk-ant-kettle-slot-1\n', stderr: '' },
    'op://claude-slots/claude-setup-token-2/credential': { code: 0, stdout: 'sk-ant-kettle-slot-2\n', stderr: '' },
    'op://claude-slots/claude-setup-token-3/credential': { code: 0, stdout: 'sk-ant-kettle-slot-3\n', stderr: '' },
    'op://claude-slots/claude-setup-token-4/credential': { code: 0, stdout: 'sk-ant-kettle-slot-4\n', stderr: '' },
  };
  const run = mock<Runner>((cmd) => Promise.resolve(tokens[cmd[2] ?? ''] ?? { code: 1, stdout: '', stderr: 'invented: no such item' }));

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  slotUsage.set('Bearer sk-ant-kettle-slot-1', { seven: { utilization: 0.4, reset: 1_792_281_600 } });
  slotUsage.set('Bearer sk-ant-kettle-slot-2', { seven: { utilization: 0.96, reset: 1_792_324_800 } });
  slotUsage.set('Bearer sk-ant-kettle-slot-4', { seven: { utilization: 0.97, reset: 1_792_303_200 } });
  for (const [index, time] of ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].entries()) {
    ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at) VALUES (?, ?, ?, ?, ?, ?)').run(time, 'abcdef012345', 5, 38.5 + index * 0.5, null, '2026-10-18T00:00:00Z');
  }
  for (const issue of ['GEO-9901', 'GEO-9902']) {
    addRun(ctx.db, { issue, title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  }

  const outcome = await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T01:00:00Z'), { force: false, signal: AbortSignal.abort() }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(outcome).toMatchObject({ name: 'AbortError' });
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM slot_usage').get()).toStrictEqual({ total: 0 });
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM news').get()).toStrictEqual({ total: 0 });
});

test('it adds no news line when the step is aborted after a read it did not need', async () => {
  const ctx = setupTest();

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  for (const [slot, seven, reset] of [
    [1, 40, '2026-10-18T00:00:00Z'],
    [2, 96, '2026-10-18T12:00:00Z'],
    [4, 97, '2026-10-18T06:00:00Z'],
  ] as const) {
    ctx.db.query('INSERT INTO slot_usage (at, slot, status, five_hour, five_hour_resets_at, seven_day, seven_day_resets_at, working_lanes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('2026-10-14T00:30:00Z', slot, '200', 0, null, seven, reset, 2);
  }
  for (const [index, time] of ['2026-10-13T23:30:00Z', '2026-10-14T00:00:00Z', '2026-10-14T00:30:00Z', '2026-10-14T01:00:00Z'].entries()) {
    ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at) VALUES (?, ?, ?, ?, ?, ?)').run(time, 'abcdef012345', 5, 38.5 + index * 0.5, null, '2026-10-18T00:00:00Z');
  }
  for (const issue of ['GEO-9901', 'GEO-9902']) {
    addRun(ctx.db, { issue, title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  }

  const run = mock<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'invented: must not run' }));

  const outcome = await runFleetStep(ctx.db, { run, httpClient: fetch, settings: { path: ctx.path, readFile: readOptionalFile } }, new Date('2026-10-14T01:00:00Z'), { force: false, signal: AbortSignal.abort() }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(outcome).toMatchObject({ name: 'AbortError' });
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM news').get()).toStrictEqual({ total: 0 });
});
