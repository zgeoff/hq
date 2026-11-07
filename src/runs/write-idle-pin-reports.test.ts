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
import type { ImpWork } from './types.ts';

interface Seeded {
  id: string;
  name: string;
  alive: boolean;
  state: string;
  parent?: string;
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
  const work: { current: ImpWork } = { current: { state: 'pushed' } };

  return {
    db: fresh.db,
    fleet,
    work,
    sweep: () =>
      sweepNow(fresh.db, client, buildStubGitHubFactsRunner({ views: {} }), {
        actor: 'sweep',
        wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local session checks no imp')), readLocalWork: () => Promise.resolve(work.current) },
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

test('it reports a non-fleet pin idle 25 hours once, not on the next sweep', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'long-chat', alive: true, state: 'done', pinned: true }, '2026-11-06T02:00:00Z');
  await ctx.sweep();
  const first = readOutboxRows(ctx.db).length;

  await ctx.sweep();

  expect([first, readOutboxRows(ctx.db).length]).toStrictEqual([1, 1]);
  expect(readOutboxRows(ctx.db)[0]?.text).toMatch(/long-chat .* idle for 25h00m/u);
});

test('it reports neither a fleet pin nor a pin idle 23 hours', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-triage', alive: true, state: 'done', pinned: true }, '2026-11-06T02:00:00Z');
  ctx.seed.atcSession({ id: '0000f006-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'short-chat', alive: true, state: 'done', pinned: true }, '2026-11-06T04:00:00Z');

  await ctx.sweep();

  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
});
