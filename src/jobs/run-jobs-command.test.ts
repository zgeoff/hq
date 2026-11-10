import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { setMeta } from '../db/set-meta.ts';
import type { OwnerProbeClient } from '../pr-status/read-owner-session.ts';
import { runJobsCommand } from './run-jobs-command.ts';
import type { JobsCommandInput } from './run-jobs-command.ts';
import { readJobs } from './session-jobs.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-release': 'kettle-release', 'z-triage': 'kettle-triage', 'z-stu': 'kettle-stu' }));
  at('2026-11-10T00:00:00Z');
  const callAs = (peerSession: string | null, input: Pick<JobsCommandInput, 'verb' | 'rest' | 'flags'>) => {
    const client: OwnerProbeClient = { peerSession, close: () => {} };
    return runJobsCommand({ db: fresh.db, ...input, probe: { openClient: () => Promise.resolve(client) } });
  };
  return { db: fresh.db, callAs };
}

test('it adds a job when the caller is the target role, found by the kernel-side session', async () => {
  const ctx = setupTest();

  const out = await ctx.callAs('kettle-release', { verb: 'add', rest: ['z-release'], flags: { every: '2h', prompt: 'check the release queue' } });

  expect(readJobs(ctx.db, null)).toStrictEqual([
    { id: 1, target: 'z-release', kind: 'every', spec: '2h', prompt: 'check the release queue', added_by: 'z-release', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T02:00:00Z', removed_at: null },
  ]);
  expect(out.text).toBe('Added job 1 for z-release: every 2h, first at 2026-11-10T02:00:00Z');
});

test('it adds a job for a role when the caller is the owner', async () => {
  const ctx = setupTest();

  await ctx.callAs('kettle-stu', { verb: 'add', rest: ['z-release'], flags: { daily: '09:30Z', prompt: 'morning reading' } });

  expect(readJobs(ctx.db, null).map((job) => ({ added_by: job.added_by, next_at: job.next_at }))).toStrictEqual([{ added_by: 'z-stu', next_at: '2026-11-10T09:30:00Z' }]);
});

test('it refuses a job for z-release from another role', async () => {
  const ctx = setupTest();

  await expect(ctx.callAs('kettle-triage', { verb: 'add', rest: ['z-release'], flags: { every: '2h', prompt: 'sneaky' } })).rejects.toThrow(/z-triage may not change the jobs of z-release/);
  expect(readJobs(ctx.db, null)).toStrictEqual([]);
});

test('it refuses a caller that only says it is z-release, whatever its environment holds', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_AS', 'z-release'));
  onTestFinished(overrideEnv('ATC_SESSION_ID', 'kettle-release'));

  await expect(ctx.callAs('kettle-triage', { verb: 'add', rest: ['z-release'], flags: { every: '2h', prompt: 'sneaky' } })).rejects.toThrow(/may not change the jobs/);
});

test('it refuses a removal from another role and keeps the job', async () => {
  const ctx = setupTest();
  await ctx.callAs('kettle-release', { verb: 'add', rest: ['z-release'], flags: { every: '2h', prompt: 'check the release queue' } });

  await expect(ctx.callAs('kettle-triage', { verb: 'remove', rest: ['1'], flags: {} })).rejects.toThrow(/may not change the jobs of z-release/);
  expect(readJobs(ctx.db, null)).toHaveLength(1);
});

test('it removes a job for the target role', async () => {
  const ctx = setupTest();
  await ctx.callAs('kettle-release', { verb: 'add', rest: ['z-release'], flags: { every: '2h', prompt: 'check the release queue' } });

  await ctx.callAs('kettle-release', { verb: 'remove', rest: ['1'], flags: {} });

  expect(readJobs(ctx.db, null)).toStrictEqual([]);
});

test('it lists jobs for anyone, a caller atc cannot identify included', async () => {
  const ctx = setupTest();
  await ctx.callAs('kettle-release', { verb: 'add', rest: ['z-release'], flags: { every: '2h', prompt: 'check the release queue' } });
  await ctx.callAs('kettle-stu', { verb: 'add', rest: ['z-delivery'], flags: { at: '2026-11-10T05:00:00Z', prompt: 'read the batch' } });

  const all = await ctx.callAs(null, { verb: 'list', rest: [], flags: {} });
  const one = await ctx.callAs(null, { verb: 'list', rest: ['z-delivery'], flags: {} });

  expect(all.text).toBe('1 z-release every 2h next 2026-11-10T02:00:00Z: check the release queue\n2 z-delivery at 2026-11-10T05:00:00Z next 2026-11-10T05:00:00Z: read the batch');
  expect(one.text).toBe('2 z-delivery at 2026-11-10T05:00:00Z next 2026-11-10T05:00:00Z: read the batch');
});

test.each([
  { title: 'a bad schedule', rest: ['z-release'], flags: { every: 'soon', prompt: 'x' }, error: /--every soon/ },
  { title: 'no schedule', rest: ['z-release'], flags: { prompt: 'x' }, error: /exactly one of/ },
  { title: 'a past one-shot time', rest: ['z-release'], flags: { at: '2026-11-09T00:00:00Z', prompt: 'x' }, error: /already past/ },
  { title: 'no prompt', rest: ['z-release'], flags: { every: '2h' }, error: /--prompt is required/ },
  { title: 'an unknown role', rest: ['z-nobody'], flags: { every: '2h', prompt: 'x' }, error: /no declared fleet session/ },
])('it refuses an add with $title as bad_args', async ({ rest, flags, error }) => {
  const ctx = setupTest();

  await expect(ctx.callAs('kettle-release', { verb: 'add', rest: [...rest], flags })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringMatching(error) });
});

test('it refuses a removal of an unknown job', async () => {
  const ctx = setupTest();

  await expect(ctx.callAs('kettle-stu', { verb: 'remove', rest: ['9'], flags: {} })).rejects.toMatchObject({ code: 'not_found' });
});
