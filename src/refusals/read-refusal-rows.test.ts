import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateEnv } from '@zgeoff/testing/helpers';
import { freshDb } from '../../test/helpers.ts';
import { readRefusalRows } from './read-refusal-rows.ts';
import { scanRefusals } from './scan-refusals.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, projects: join(fresh.dir, 'projects') };
}

test('it reads every stored refusal in the order the scan stored them', async () => {
  const ctx = setupTest();
  const transcript = join(ctx.projects, 'kettle', 'session.jsonl');
  const records = [
    { type: 'assistant', uuid: '00000000-0000-4000-8000-000000000001', sessionId: '11111111-2222-4333-8444-555555555555', timestamp: '2026-10-21T20:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_b', name: 'Bash', input: { command: 'boil --hard' } }] } },
    { type: 'user', uuid: '00000000-0000-4000-8000-000000000002', sessionId: '11111111-2222-4333-8444-555555555555', cwd: '/work/kettle', timestamp: '2026-10-21T20:00:05.000Z', toolDenialKind: 'automode-blocked', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_b', is_error: true, content: 'Permission denied. Reason: too hot\nTo allow it, ask.' }] } },
    { type: 'assistant', uuid: '00000000-0000-4000-8000-000000000003', sessionId: '11111111-2222-4333-8444-555555555555', timestamp: '2026-10-21T21:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_a', name: 'Bash', input: { command: 'pour --fast' } }] } },
    { type: 'user', uuid: '00000000-0000-4000-8000-000000000004', sessionId: '11111111-2222-4333-8444-555555555555', cwd: '/work/kettle', timestamp: '2026-10-21T21:00:05.000Z', toolDenialKind: 'automode-blocked', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_a', is_error: true, content: 'Permission denied. Reason: too fast\nTo allow it, ask.' }] } },
  ];
  mkdirSync(join(ctx.projects, 'kettle'), { recursive: true });
  writeFileSync(transcript, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  utimesSync(transcript, new Date('2026-10-21T22:00:00Z'), new Date('2026-10-21T22:00:00Z'));
  updateEnv('HQ_NOW', '2026-10-22T00:00:00Z');
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- dir is scanRefusals' own option name
  await scanRefusals(ctx.db, { dir: ctx.projects, sessions: () => Promise.resolve([]) });

  expect(readRefusalRows(ctx.db)).toStrictEqual([
    { uuid: '00000000-0000-4000-8000-000000000002', at: '2026-10-21T20:00:05Z', claude_session: '11111111-2222-4333-8444-555555555555', transcript, subagent: 0, cwd: '/work/kettle', atc_session: null, atc_name: null, issue: null, tool: 'Bash', input: 'boil --hard', reason: 'too hot', scanned_at: '2026-10-22T00:00:00Z' },
    { uuid: '00000000-0000-4000-8000-000000000004', at: '2026-10-21T21:00:05Z', claude_session: '11111111-2222-4333-8444-555555555555', transcript, subagent: 0, cwd: '/work/kettle', atc_session: null, atc_name: null, issue: null, tool: 'Bash', input: 'pour --fast', reason: 'too fast', scanned_at: '2026-10-22T00:00:00Z' },
  ]);
});

test('it reads no rows before the first scan', () => {
  const ctx = setupTest();

  expect(readRefusalRows(ctx.db)).toStrictEqual([]);
});
