import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { AtcClient } from '../atc/atc-client.ts';
import type { FleetSession } from '../fleet/types.ts';
import { readOutboxRows } from '../outbox/read-outbox-rows.ts';
import { fakeAtc, freshDb } from '../../test/helpers.ts';
import { addRun } from './add-run.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';
import { sweepNow } from './sweep-now.ts';

interface Seeded {
  id: string;
  name: string;
  alive: boolean;
  state: string;
  pinned?: boolean;
}

async function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const roster: Seeded[] = [];
  const server = fakeAtc(fresh.dir, roster);
  onTestFinished(server.stop);
  const client = await AtcClient.open();
  onTestFinished(() => client.close());
  const fleetSessions: FleetSession[] = [];
  const fleet = buildStubFleetClient({ sessions: fleetSessions });

  return {
    db: fresh.db,
    fleet,
    sweep: () =>
      sweepNow(fresh.db, client, buildStubGitHubFactsRunner({ views: {} }), {
        actor: 'sweep',
        wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local session checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' }) },
        log: () => {},
      }),
    seed: {
      atcSession: (session: Seeded, lastActivityAt: string) => {
        roster.push(session);
        fleetSessions.push(session);
        server.activity.set(session.id, Date.parse(lastActivityAt));
      },
      closedRun: (issue: string, sessionID: string) => {
        addRun(fresh.db, { issue, title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
        setSession(fresh.db, issue, sessionID, 'z-delivery', 'add');
        setState(fresh.db, issue, 'dropped', { note: 'invented' }, 'z-delivery');
      },
    },
  };
}

test('it reports a non-fleet pin idle 25 hours to stu once per idle stretch, not on the next sweep', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'long-chat', alive: true, state: 'done', pinned: true }, '2026-11-06T02:00:00Z');
  await ctx.sweep();

  await ctx.sweep();

  expect(readOutboxRows(ctx.db)).toStrictEqual([
    {
      id: expect.any(Number),
      event_seq: expect.any(Number),
      target: 'stu',
      text: 'long-chat (0000f004) is pinned and has been idle for 25h00m. It is not part of the fleet; decide whether it still needs its pin.',
      idem_key: expect.any(String),
      status: 'pending',
      attempts: 0,
      last_error: null,
      message_id: null,
      created_at: '2026-11-07T03:00:00Z',
      sent_at: null,
      topic: null,
    },
  ]);
});

test('it names the run of a pinned session a run recorded', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f007-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'run-chat', alive: true, state: 'done', pinned: true }, '2026-11-06T02:00:00Z');
  ctx.seed.closedRun('GEO-607', '0000f007');

  await ctx.sweep();

  expect(readOutboxRows(ctx.db)).toStrictEqual([
    {
      id: expect.any(Number),
      event_seq: expect.any(Number),
      target: 'stu',
      text: 'run-chat (0000f007) is pinned and has been idle for 25h00m, on run GEO-607. It is not part of the fleet; decide whether it still needs its pin.',
      idem_key: expect.any(String),
      status: 'pending',
      attempts: 0,
      last_error: null,
      message_id: null,
      created_at: '2026-11-07T03:00:00Z',
      sent_at: null,
      topic: null,
    },
  ]);
});

test('it forgets nothing and calls atc for nothing when it reports a non-fleet pin idle 25 hours', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'long-chat', alive: true, state: 'done', pinned: true }, '2026-11-06T02:00:00Z');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
});

test('it reports neither a fleet pin nor a pin idle 23 hours', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-triage', alive: true, state: 'done', pinned: true }, '2026-11-06T02:00:00Z');
  ctx.seed.atcSession({ id: '0000f006-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'short-chat', alive: true, state: 'done', pinned: true }, '2026-11-06T04:00:00Z');

  await ctx.sweep();

  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
});
