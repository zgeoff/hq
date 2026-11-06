import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { AtcClient } from '../atc/atc-client.ts';
import type { FleetSession } from '../fleet/types.ts';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { fakeAtc, freshDb } from '../../test/helpers.ts';
import { addOwnedPr } from './add-owned-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { requireRun } from './require-run.ts';
import { setSession } from './set-session.ts';
import type { ImpWork } from './types.ts';
import { sweepNow } from './sweep-now.ts';

async function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const roster: { id: string; name: string; alive: boolean; state: string; parent?: string; pinned?: boolean }[] = [];
  const server = fakeAtc(fresh.dir, roster);
  onTestFinished(server.stop);
  const client = await AtcClient.open();
  onTestFinished(() => client.close());
  const fleetSessions: FleetSession[] = [];
  const killFailures: string[] = [];
  const fleet = buildStubFleetClient({ sessions: fleetSessions, killFailures });
  const logged: string[] = [];
  const localWork: { current: ImpWork } = { current: { state: 'pushed' } };

  return {
    db: fresh.db,
    sweep: () =>
      sweepNow(fresh.db, client, buildStubGitHubFactsRunner({ views: {} }), {
        actor: 'sweep',
        wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve(localWork.current) },
        log: (line) => logged.push(line),
      }),
    seed: {
      atcSession: (session: (typeof roster)[number], lastActivityAt: string) => {
        roster.push(session);
        fleetSessions.push(session);
        server.activity.set(session.id, Date.parse(lastActivityAt));
      },
    },
    fleet,
    killFailures,
    logged,
    localWork,
  };
}

test('it forgets the helper session whose PRs merged, keeps the one with an open PR, and leaves the run state', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'gadgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets and gadgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-501', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  addOwnedPr(ctx.db, 'GEO-501', 'gadgets#1', { actor: 'z-delivery', session: '0000e002' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(requireRun(ctx.db, 'GEO-501').state).toBe('working');
  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up']).map((event) => JSON.parse(event.data))).toStrictEqual([{ session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]);
});

test('it wraps a part session up once across two sweeps', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  await ctx.sweep();

  await ctx.sweep();

  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up'])).toHaveLength(1);
});

test('it wraps a part session up once when two sweeps overlap', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });

  await Promise.all([ctx.sweep(), ctx.sweep()]);

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up'])).toHaveLength(1);
});

test('it keeps a helper session with unpushed work on one sweep and forgets it on the next once the work is pushed', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  ctx.localWork.current = { state: 'unpushed', detail: '1 commit ahead of origin' };
  await ctx.sweep();
  ctx.localWork.current = { state: 'pushed' };

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up'])).toHaveLength(1);
});

test('it retries a part session whose claim an earlier sweep left without finishing', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T02:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  logEvent(ctx.db, 'run', 'GEO-501', 'part-wrap-up', 'sweep', null, null, { session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up-done']).map((event) => JSON.parse(event.data))).toStrictEqual([{ session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]);
});

test('it leaves a part session alone while a recent claim on it is unfinished', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T02:55:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  logEvent(ctx.db, 'run', 'GEO-501', 'part-wrap-up', 'sweep', null, null, { session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
});

test('it keeps a helper session whose sub-session is pinned', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000e00a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-probe', alive: true, state: 'needs_you', parent: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pinned: true }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up'])).toStrictEqual([]);
});

test('it logs a part session kept because its unpushed-work check could not run', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  ctx.localWork.current = { state: 'unknown', detail: 'git status exited 128' };

  await ctx.sweep();

  expect(ctx.logged).toStrictEqual([
    'part-session wrap-up of 0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa on GEO-501 kept 0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa: the unpushed-work check could not run (git status exited 128), so the session stays',
  ]);
});

test('it logs a part session kept for the same reason once, and again when the reason changes', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  ctx.localWork.current = { state: 'unknown', detail: 'git status exited 128' };

  await ctx.sweep();
  updateEnv('HQ_NOW', '2026-11-07T03:05:00Z');
  await ctx.sweep();
  ctx.localWork.current = { state: 'unknown', detail: 'git status exited 129' };
  updateEnv('HQ_NOW', '2026-11-07T03:10:00Z');
  await ctx.sweep();

  expect(ctx.logged).toStrictEqual([
    'part-session wrap-up of 0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa on GEO-501 kept 0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa: the unpushed-work check could not run (git status exited 128), so the session stays',
    'part-session wrap-up of 0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa on GEO-501 kept 0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa: the unpushed-work check could not run (git status exited 129), so the session stays',
  ]);
});

test('it logs a failed part wrap-up and releases the claim for the next sweep', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, '2026-11-07T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-501', title: 'Invented widgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  ctx.killFailures.push('0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  await ctx.sweep();

  expect(ctx.logged).toStrictEqual(['part-session wrap-up of 0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa on GEO-501 failed: 0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa: atc did not answer session.kill']);
  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up'])).toStrictEqual([]);
});
