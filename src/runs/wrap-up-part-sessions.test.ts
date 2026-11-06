import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { AtcClient } from '../atc/atc-client.ts';
import { overrideEnv } from '../config/override-env.ts';
import { readEvents } from '../read-events.ts';
import { fakeAtc, freshDb } from '../../test/helpers.ts';
import { addOwnedPr } from './add-owned-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { setSession } from './set-session.ts';
import { sweepNow } from './sweep-now.ts';

async function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', '2026-11-07T03:00:00Z'));
  const roster: { id: string; name: string; alive: boolean; state: string }[] = [];
  const server = fakeAtc(fresh.dir, roster);
  onTestFinished(server.stop);
  const client = await AtcClient.open();
  onTestFinished(() => client.close());
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'gadgets-part', alive: true, state: 'done' },
    ],
  });
  roster.push({ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'widgets-part', alive: true, state: 'done' }, { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'gadgets-part', alive: true, state: 'done' });
  server.activity.set('0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-11-07T01:00:00Z'));
  server.activity.set('0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-11-07T01:00:00Z'));
  addRun(fresh.db, { issue: 'GEO-501', title: 'Invented widgets and gadgets', place: 'local', session: null, next: 'Parts working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(fresh.db, 'GEO-501', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(fresh.db, 'GEO-501', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');

  return {
    db: fresh.db,
    sweep: () =>
      sweepNow(fresh.db, client, buildStubGitHubFactsRunner({ views: {} }), {
        actor: 'sweep',
        wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) },
        log: () => {},
      }),
    fleet,
  };
}

test('it forgets the helper session whose PRs merged, keeps the one with an open PR, and leaves the run state', async () => {
  const ctx = await setupTest();
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  addOwnedPr(ctx.db, 'GEO-501', 'gadgets#1', { actor: 'z-delivery', session: '0000e002' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(ctx.db.query("SELECT state FROM runs WHERE issue = 'GEO-501'").get()).toStrictEqual({ state: 'working' });
  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up']).map((event) => JSON.parse(event.data))).toStrictEqual([{ session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]);
});

test('it wraps a part session up once across two sweeps', async () => {
  const ctx = await setupTest();
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });

  await ctx.sweep();
  await ctx.sweep();

  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up'])).toHaveLength(1);
});

test('it wraps a part session up once when two sweeps overlap', async () => {
  const ctx = await setupTest();
  addOwnedPr(ctx.db, 'GEO-501', 'widgets#1', { actor: 'z-delivery', session: '0000e001' });
  closePr(ctx.db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });

  await Promise.all([ctx.sweep(), ctx.sweep()]);

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(readEvents(ctx.db, 'run', 'GEO-501', ['part-wrap-up'])).toHaveLength(1);
});
