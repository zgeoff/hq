import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import { server } from '../../../mocks/node.ts';
import { at, freshDb } from '../../../test/helpers.ts';
import { overrideEnv } from '../../config/override-env.ts';
import { addRun } from '../../runs/add-run.ts';
import type { RunResult, Runner } from '../../runner/types.ts';
import { runSlotRead } from './run-slot-read.ts';

function setupTest() {
  const fresh = freshDb();
  const directory = mkdtempSync(join(tmpdir(), 'hq-slot-run-'));
  const path = join(directory, 'settings.local.json');

  onTestFinished(fresh.cleanup);
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_SLOTS_OP_SETTINGS', path));

  return { db: fresh.db, path };
}

test('it reads four slots, stores one row each with the working lane count, and keeps a 403 and an op failure as rows', async () => {
  const ctx = setupTest();
  const answers: Record<string, RunResult> = {
    'op://claude-slots/claude-setup-token-1/credential': { code: 0, stdout: 'sk-ant-kettle-slot-1\n', stderr: '' },
    'op://claude-slots/claude-setup-token-2/credential': { code: 0, stdout: 'sk-ant-kettle-slot-2\n', stderr: '' },
    'op://claude-slots/claude-setup-token-3/credential': { code: 1, stdout: '', stderr: 'invented: item not found' },
    'op://claude-slots/claude-setup-token-4/credential': { code: 0, stdout: 'sk-ant-kettle-slot-4\n', stderr: '' },
  };
  const run = mock<Runner>((cmd) => Promise.resolve(answers[cmd[2] ?? ''] ?? { code: 1, stdout: '', stderr: 'invented: no answer' }));
  const usage = { 'anthropic-ratelimit-unified-5h-utilization': '0.1', 'anthropic-ratelimit-unified-5h-reset': '1792000000', 'anthropic-ratelimit-unified-7d-utilization': '0.3', 'anthropic-ratelimit-unified-7d-reset': '1792400000' };
  const statuses: Record<string, number> = { 'Bearer sk-ant-kettle-slot-1': 200, 'Bearer sk-ant-kettle-slot-2': 403, 'Bearer sk-ant-kettle-slot-4': 200 };

  at('2026-10-14T01:00:00Z');
  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  server.use(
    http.post('https://api.anthropic.com/v1/messages', (info) => {
      const status = statuses[info.request.headers.get('authorization') ?? ''] ?? 500;

      return HttpResponse.json({}, { status, headers: status === 200 ? usage : {} });
    }),
  );
  const result = await runSlotRead(ctx.db, run, new Date('2026-10-14T01:00:00Z'));

  expect(result).toMatchObject({ kind: 'read', problems: ['slot 3: op read failed (exit 1)'] });
  expect(ctx.db.query('SELECT at, slot, status, five_hour, seven_day, working_lanes FROM slot_usage ORDER BY slot').all()).toStrictEqual([
    { at: '2026-10-14T01:00:00Z', slot: 1, status: '200', five_hour: 10, seven_day: 30, working_lanes: 1 },
    { at: '2026-10-14T01:00:00Z', slot: 2, status: '403', five_hour: null, seven_day: null, working_lanes: 1 },
    { at: '2026-10-14T01:00:00Z', slot: 3, status: 'op-failed', five_hour: null, seven_day: null, working_lanes: 1 },
    { at: '2026-10-14T01:00:00Z', slot: 4, status: '200', five_hour: 10, seven_day: 30, working_lanes: 1 },
  ]);
});

test('it reads no slot and stores nothing when the slot reads are not set up', async () => {
  const ctx = setupTest();
  const run = mock<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'invented: must not run' }));

  const result = await runSlotRead(ctx.db, run, new Date('2026-10-14T01:00:00Z'));

  expect(result).toStrictEqual({ kind: 'not-set-up', reason: `no settings file at ${ctx.path}` });
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM slot_usage').get()).toStrictEqual({ total: 0 });
});

test('it keeps every token out of the stored rows and the problems, even when the API echoes one', async () => {
  const ctx = setupTest();
  const run = mock<Runner>((cmd) => Promise.resolve({ code: 0, stdout: `sk-ant-kettle-${cmd[2]?.includes('-1/') ? 'one' : 'other'}-token-0042\n`, stderr: '' }));

  writeFileSync(ctx.path, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  server.use(http.post('https://api.anthropic.com/v1/messages', (info) => HttpResponse.json({ error: `bad credential ${info.request.headers.get('authorization')}` }, { status: 403 })));
  const result = await runSlotRead(ctx.db, run, new Date('2026-10-14T01:00:00Z'));
  const stored = JSON.stringify(ctx.db.query('SELECT * FROM slot_usage').all());
  const printed = JSON.stringify(result);

  expect(stored).not.toInclude('sk-ant-kettle');
  expect(stored).not.toInclude('ops_kettle');
  expect(printed).not.toInclude('sk-ant-kettle');
  expect(printed).not.toInclude('ops_kettle');
});
