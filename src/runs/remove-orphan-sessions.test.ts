import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { updateEnv } from '@zgeoff/testing/helpers';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { AtcClient } from '../atc/atc-client.ts';
import type { FleetSession } from '../fleet/types.ts';
import { readEvents } from '../read-events.ts';
import { realRunner } from '../runner/real-runner.ts';
import { readLocalWork } from './read-local-work.ts';
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
  locator?: { targetID: string };
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
  const forgets: Record<string, { forgotten: boolean; confirmToken?: string }[]> = {};
  const fleet = buildStubFleetClient({ sessions: fleetSessions, forgets });
  const work: { current: ImpWork; bySession: Map<string, ImpWork> } = { current: { state: 'pushed' }, bySession: new Map() };

  const readWork = (session: FleetSession) => Promise.resolve(work.bySession.get(session.id) ?? work.current);

  return {
    db: fresh.db,
    directory: fresh.dir,
    fleet,
    forgets,
    work,
    sweep: () =>
      sweepNow(fresh.db, client, buildStubGitHubFactsRunner({ views: {} }), {
        actor: 'sweep',
        wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: readWork, readLocalWork: readWork },
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
      closedOwnerChatRun: (issue: string, sessionID: string) => {
        addRun(fresh.db, { issue, title: 'Invented teapot chat', place: 'local', session: null, next: 'Chatting.', gate: null, geoffChat: true, lane: 'cloud', actor: 'z-delivery' });
        setSession(fresh.db, issue, sessionID, 'z-delivery', 'add');
        setState(fresh.db, issue, 'dropped', { note: 'invented' }, 'z-delivery');
      },
    },
  };
}

test('it forgets an exited session of a closed run and logs why', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f001', 'kill 0000f001', 'unpin 0000f001', 'forget 0000f001']);
  expect(readEvents(ctx.db, 'hq', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ['session-forgotten'])).toHaveLength(1);
});

test('it forgets an exited session whose working directory was removed', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');
  ctx.work.current = await readLocalWork(realRunner, join(ctx.directory, 'kettle-workspace'));

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f001', 'kill 0000f001', 'unpin 0000f001', 'forget 0000f001']);
});

test('it keeps an exited session with unpushed work, and checks it again only after a day', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.work.current = { state: 'unpushed', detail: 'one commit' };
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');
  await ctx.sweep();
  ctx.work.current = { state: 'pushed' };

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
  expect(readEvents(ctx.db, 'hq', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ['session-kept'])).toHaveLength(1);
});

test('it checks a kept session again more than a day later, and forgets it once its work is pushed', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.work.current = { state: 'unpushed', detail: 'one commit' };
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');
  await ctx.sweep();
  ctx.work.current = { state: 'pushed' };
  updateEnv('HQ_NOW', '2026-11-08T03:01:00Z');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f001', 'kill 0000f001', 'unpin 0000f001', 'forget 0000f001']);
  expect(readEvents(ctx.db, 'hq', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ['session-forgotten'])).toStrictEqual([
    {
      seq: expect.any(Number),
      action: 'session-forgotten',
      actor: 'sweep',
      at: '2026-11-08T03:01:00Z',
      data: JSON.stringify({ name: 'kettle-agent', issue: 'GEO-601', reason: 'exited, with its work pushed and no open run needing it', destroyed: false }),
    },
  ]);
});

test('it keeps an exited session of a closed run the owner chats on', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-chat', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedOwnerChatRun('GEO-605', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
});

test('it keeps an exited session that an open run lists as active', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T02:59:00Z');
  addRun(ctx.db, { issue: 'GEO-602', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-602', '0000f001', 'z-delivery', 'add');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
});

test('it keeps an exited session no run recorded and a fleet session', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'owners-own', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-stu', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
});

test('it forgets an exited child of a fleet session that no run recorded', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-stu', alive: true, state: 'done' }, '2026-11-07T02:59:00Z');
  ctx.seed.atcSession({ id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'helper', alive: false, state: 'exited', parent: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, '2026-11-07T01:00:00Z');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f003', 'kill 0000f003', 'unpin 0000f003', 'forget 0000f003']);
});

test('it keeps an exited parent that has a live child', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, state: 'done', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, '2026-11-07T02:59:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
});

test('it keeps an exited parent whose child stays for unpushed work, and forgets neither', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.work.bySession.set('0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { state: 'unpushed', detail: 'one commit' });
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
  expect(readEvents(ctx.db, 'hq', '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ['session-kept'])).toHaveLength(1);
});

test('it keeps a pinned exited session of a closed run without a call to atc or a kept event', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited', pinned: true }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
  expect(readEvents(ctx.db, 'hq', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ['session-kept'])).toStrictEqual([]);
});

test('it keeps an exited child of a pinned fleet session without a call to atc or a kept event', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-stu', alive: true, state: 'done', pinned: true }, '2026-11-07T02:59:00Z');
  ctx.seed.atcSession({ id: '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'helper', alive: false, state: 'exited', parent: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, '2026-11-07T01:00:00Z');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual([]);
  expect(readEvents(ctx.db, 'hq', '0000f003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ['session-kept'])).toStrictEqual([]);
});

test('it forgets an exited imp session of a closed run with its work pushed, destroys the imp, and logs it', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.forgets['0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] = [{ forgotten: false, confirmToken: 'token-kettle' }];
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited', locator: { targetID: 'imp-kettle' } }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f001', 'forget-live 0000f001', 'forget-live 0000f001 token-kettle']);
  expect(readEvents(ctx.db, 'hq', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ['session-forgotten'])).toStrictEqual([
    {
      seq: expect.any(Number),
      action: 'session-forgotten',
      actor: 'sweep',
      at: '2026-11-07T03:00:00Z',
      data: JSON.stringify({ name: 'kettle-agent', issue: 'GEO-601', reason: 'exited, with its work pushed and no open run needing it', destroyed: true }),
    },
  ]);
});

test('it forgets an exited parent and its exited child, the child first', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f004', 'kill 0000f004', 'unpin 0000f004', 'forget 0000f004', 'unpin 0000f001', 'kill 0000f001', 'unpin 0000f001', 'forget 0000f001']);
});

test('it keeps an exited parent when its child fails to be forgotten', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.forgets['0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] = [{ forgotten: false }];
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f004', 'kill 0000f004', 'unpin 0000f004', 'forget 0000f004']);
});

test('it keeps an exited parent and grandparent when the grandchild fails to be forgotten', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.forgets['0000f005-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] = [{ forgotten: false }];
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000f005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-scout', alive: false, state: 'exited', parent: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');
  ctx.seed.closedRun('GEO-602', '0000f004');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f005', 'kill 0000f005', 'unpin 0000f005', 'forget 0000f005']);
});

test('it destroys the imp of an exited imp child under a local parent', async () => {
  const ctx = await setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  ctx.forgets['0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] = [{ forgotten: false, confirmToken: 'token-kettle' }];
  ctx.seed.atcSession({ id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited', locator: { targetID: 'local' } }, '2026-11-07T01:00:00Z');
  ctx.seed.atcSession({ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', locator: { targetID: 'imp-kettle' } }, '2026-11-07T01:00:00Z');
  ctx.seed.closedRun('GEO-601', '0000f001');

  await ctx.sweep();

  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000f004', 'forget-live 0000f004', 'forget-live 0000f004 token-kettle', 'unpin 0000f001', 'kill 0000f001', 'unpin 0000f001', 'forget 0000f001']);
});
