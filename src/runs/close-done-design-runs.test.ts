import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { freshDb } from '../../test/helpers.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { readOutboxRows } from '../outbox/read-outbox-rows.ts';
import { buildMockAddRunInput } from './test-utils/build-mock-add-run-input.ts';
import { buildRunSeeder } from './test-utils/build-run-seeder.ts';
import { addRun } from './add-run.ts';
import { closeDoneDesignRuns } from './close-done-design-runs.ts';
import { listRuns } from './list-runs.ts';
import { reopenRun } from './reopen-run.ts';
import { readClosedIssueAlerts } from './read-closed-issue-alerts.ts';
import { readEvents } from '../read-events.ts';
import type { StubFleetAnswers } from '../../test/build-stub-fleet-client.ts';
import type { ImpWork } from './types.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    seed: buildRunSeeder(fresh),
    closeDesignRuns: (answers: StubFleetAnswers) => {
      const work: ImpWork = { state: 'pushed' };
      const fleet = buildStubFleetClient(answers);
      const closed = closeDoneDesignRuns(fresh.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve(work), readLocalWork: () => Promise.resolve(work) }, 'hq-lanes');
      return closed.then((result) => ({ issues: result.closed, errors: result.errors, calls: fleet.calls }));
    },
    readRuns: () => listRuns(fresh.db, true).map((run) => ({ issue: run.issue, state: run.state, close_note: run.close_note })),
    readOutbox: () => readOutboxRows(fresh.db).map((row) => ({ target: row.target, text: row.text })),
  };
}

test('it moves a design run whose issue is Done to done, and asks z-delivery once to close its pinned session', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ctx.seed.run({ issue: 'GEO-9701', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9701', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9701', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const answers = { sessions: [{ id: session, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] };

  const first = await ctx.closeDesignRuns(answers);
  const second = await ctx.closeDesignRuns(answers);

  expect(first).toStrictEqual({ issues: ['GEO-9701'], errors: [], calls: [] });
  expect(second).toStrictEqual({ issues: [], errors: [], calls: [] });
  expect(ctx.readRuns()).toStrictEqual([{ issue: 'GEO-9701', state: 'done', close_note: 'The Design issue is Done in Linear' }]);
  expect(ctx.readOutbox()).toStrictEqual([
    { target: 'z-delivery', text: `GEO-9701: its Design issue is Done in Linear, and the run is done. Unpin and stop session ${session}; hq does not stop a pinned session itself.` },
  ]);
});

test('it forgets an unpinned, fully pushed session of a closed design run and asks nobody', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ctx.seed.run({ issue: 'GEO-9702', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9702', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9702', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);

  const closed = await ctx.closeDesignRuns({ sessions: [{ id: session, name: 'kettle-design', alive: true, cwd: '/workspace/kettle' }] });

  expect(closed).toStrictEqual({ issues: ['GEO-9702'], errors: [], calls: ['unpin 0000b001', 'kill 0000b001', 'unpin 0000b001', 'forget 0000b001'] });
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it wraps up a closed design run only once across passes', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ctx.seed.run({ issue: 'GEO-9709', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9709', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9709', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const answers = { sessions: [{ id: session, name: 'kettle-design', alive: true, cwd: '/workspace/kettle' }] };
  await ctx.closeDesignRuns(answers);

  const second = await ctx.closeDesignRuns(answers);

  expect(second).toStrictEqual({ issues: [], errors: [], calls: [] });
});

test('it records why the wrap-up failed in its result event', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ctx.seed.run({ issue: 'GEO-9710', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9710', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9710', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);

  await closeDoneDesignRuns(ctx.db, { openClient: () => Promise.reject(new Error('invented: atc is down')), readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');

  expect(readEvents(ctx.db, 'run', 'GEO-9710', ['design-done-close-result'])).toStrictEqual([
    { seq: expect.any(Number), action: 'design-done-close-result', actor: 'hq-lanes', at: expect.any(String), data: JSON.stringify({ forgotten: [], destroyed: [], kept: [], failed: [{ id: session, reason: 'atc: invented: atc is down' }] }) },
  ]);
});

test('it leaves a design run whose issue is open, and its pinned session, alone', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ctx.seed.run({ issue: 'GEO-9703', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9703', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9703', type: 'Design', title: 'Invented kettle design', state: 'open', closed_at: null }]);

  const closed = await ctx.closeDesignRuns({ sessions: [{ id: session, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] });

  expect(closed).toStrictEqual({ issues: [], errors: [], calls: [] });
  expect(ctx.readRuns()).toStrictEqual([{ issue: 'GEO-9703', state: 'working', close_note: null }]);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it leaves a build run whose issue is Done to its alert', async () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9704', title: 'Invented kettle build', place: 'imp', lane: 'cloud' });
  writeIssues(ctx.db, [{ issue: 'GEO-9704', type: 'none', title: 'Invented kettle build', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);

  const closed = await ctx.closeDesignRuns({ sessions: [] });

  expect(closed).toStrictEqual({ issues: [], errors: [], calls: [] });
  expect(ctx.readRuns()).toStrictEqual([{ issue: 'GEO-9704', state: 'working', close_note: null }]);
  expect(readClosedIssueAlerts(ctx.db)).toHaveLength(1);
});

test('it raises no closed-issue alert for a design run it closed', async () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9705', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  writeIssues(ctx.db, [{ issue: 'GEO-9705', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);

  await ctx.closeDesignRuns({ sessions: [] });

  expect(readClosedIssueAlerts(ctx.db)).toStrictEqual([]);
});

test('it still closes the run and asks z-delivery to stop its active session, without calling it pinned, when atc fails', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ctx.seed.run({ issue: 'GEO-9706', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9706', session: '0000c002-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  ctx.seed.runSession({ issue: 'GEO-9706', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9706', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const closed = closeDoneDesignRuns(ctx.db, { openClient: () => Promise.reject(new Error('invented: atc is down')), readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');

  await expect(closed).resolves.toStrictEqual({ closed: ['GEO-9706'], errors: [] });
  expect(ctx.readRuns()).toStrictEqual([{ issue: 'GEO-9706', state: 'done', close_note: 'The Design issue is Done in Linear' }]);
  expect(ctx.readOutbox()).toStrictEqual([
    { target: 'z-delivery', text: `GEO-9706: its Design issue is Done in Linear, and the run is done. hq could not close session ${session} (atc: invented: atc is down); stop it if it is still running.` },
  ]);
  expect(readEvents(ctx.db, 'run', 'GEO-9706', ['design-done-close-session'])).toStrictEqual([
    { seq: expect.any(Number), action: 'design-done-close-session', actor: 'hq-lanes', at: expect.any(String), data: JSON.stringify({ session, why: 'failed', reason: 'atc: invented: atc is down' }) },
  ]);
});

test('it finishes a close that an earlier pass claimed over ten minutes ago and never finished, and asks z-delivery once', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  updateEnv('HQ_NOW', '2026-10-21T02:00:00Z');
  ctx.seed.run({ issue: 'GEO-9708', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9708', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9708', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const stalled = Promise.withResolvers<never>();
  void closeDoneDesignRuns(ctx.db, { openClient: () => stalled.promise, readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');
  updateEnv('HQ_NOW', '2026-10-21T02:11:00Z');

  const finished = await ctx.closeDesignRuns({ sessions: [{ id: session, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] });

  expect(finished).toStrictEqual({ issues: [], errors: [], calls: [] });
  expect(ctx.readOutbox()).toStrictEqual([
    { target: 'z-delivery', text: `GEO-9708: its Design issue is Done in Linear, and the run is done. Unpin and stop session ${session}; hq does not stop a pinned session itself.` },
  ]);
});

test('it leaves a close that another pass claimed under ten minutes ago to that pass', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  updateEnv('HQ_NOW', '2026-10-21T02:00:00Z');
  ctx.seed.run({ issue: 'GEO-9711', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9711', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9711', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const stalled = Promise.withResolvers<never>();
  void closeDoneDesignRuns(ctx.db, { openClient: () => stalled.promise, readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');
  updateEnv('HQ_NOW', '2026-10-21T02:09:00Z');

  const next = await ctx.closeDesignRuns({ sessions: [{ id: session, name: 'kettle-design', alive: true, cwd: '/workspace/kettle' }] });

  expect(next).toStrictEqual({ issues: [], errors: [], calls: [] });
});

test('it wraps up a stale claimed close in only one of two passes that run at once', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  updateEnv('HQ_NOW', '2026-10-21T02:00:00Z');
  ctx.seed.run({ issue: 'GEO-9712', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9712', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9712', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const stalled = Promise.withResolvers<never>();
  void closeDoneDesignRuns(ctx.db, { openClient: () => stalled.promise, readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');
  updateEnv('HQ_NOW', '2026-10-21T02:11:00Z');
  const answers = { sessions: [{ id: session, name: 'kettle-design', alive: true, cwd: '/workspace/kettle' }] };

  const passes = await Promise.all([ctx.closeDesignRuns(answers), ctx.closeDesignRuns(answers)]);

  expect(passes.map((pass) => pass.calls)).toStrictEqual([['unpin 0000b001', 'kill 0000b001', 'unpin 0000b001', 'forget 0000b001'], []]);
});

test('it sends nothing from a pass that wakes after another pass finished its stale claim', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  updateEnv('HQ_NOW', '2026-10-21T02:00:00Z');
  ctx.seed.run({ issue: 'GEO-9713', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9713', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9713', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const stalled = Promise.withResolvers<never>();
  const late = closeDoneDesignRuns(ctx.db, { openClient: () => stalled.promise, readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');
  updateEnv('HQ_NOW', '2026-10-21T02:11:00Z');
  await ctx.closeDesignRuns({ sessions: [{ id: session, name: 'kettle-design', alive: true, cwd: '/workspace/kettle' }] });
  stalled.reject(new Error('invented: atc answered late'));

  await late;

  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it neither wraps up nor messages about a claimed close after the run is reopened', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  updateEnv('HQ_NOW', '2026-10-21T02:00:00Z');
  ctx.seed.run({ issue: 'GEO-9714', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9714', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9714', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const stalled = Promise.withResolvers<never>();
  void closeDoneDesignRuns(ctx.db, { openClient: () => stalled.promise, readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');
  reopenRun(ctx.db, { issue: 'GEO-9714', next: 'Reopened: agent working.', design: { slots: { agent: 2, withGeoff: 1 }, error: null, asked: null }, actor: 'hq-lanes' });
  writeIssues(ctx.db, [{ issue: 'GEO-9714', type: 'Design', title: 'Invented kettle design', state: 'open', closed_at: null }]);
  updateEnv('HQ_NOW', '2026-10-21T02:11:00Z');

  const next = await ctx.closeDesignRuns({ sessions: [{ id: session, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] });

  expect(next).toStrictEqual({ issues: [], errors: [], calls: [] });
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it neither wraps up nor messages about a claimed close after the design run becomes the build run', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  updateEnv('HQ_NOW', '2026-10-21T02:00:00Z');
  ctx.seed.run({ issue: 'GEO-9715', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9715', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9715', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const stalled = Promise.withResolvers<never>();
  void closeDoneDesignRuns(ctx.db, { openClient: () => stalled.promise, readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');
  addRun(ctx.db, buildMockAddRunInput({ issue: 'GEO-9715', title: 'Invented kettle build', place: 'local' }));
  updateEnv('HQ_NOW', '2026-10-21T02:11:00Z');

  const next = await ctx.closeDesignRuns({ sessions: [{ id: session, name: 'kettle-design', alive: true, cwd: '/workspace/kettle' }] });

  expect(next).toStrictEqual({ issues: [], errors: [], calls: [] });
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it asks z-delivery only once about a session when its run is reopened and closed again', async () => {
  const ctx = setupTest();
  const session = '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ctx.seed.run({ issue: 'GEO-9707', title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } });
  ctx.seed.runSession({ issue: 'GEO-9707', session });
  writeIssues(ctx.db, [{ issue: 'GEO-9707', type: 'Design', title: 'Invented kettle design', state: 'completed', closed_at: '2026-10-21T01:02:03Z' }]);
  const answers = { sessions: [{ id: session, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] };
  await ctx.closeDesignRuns(answers);
  reopenRun(ctx.db, { issue: 'GEO-9707', next: 'Reopened: agent working.', design: { slots: { agent: 2, withGeoff: 1 }, error: null, asked: null }, actor: 'hq-lanes' });

  const again = await ctx.closeDesignRuns(answers);

  expect(again.issues).toStrictEqual(['GEO-9707']);
  expect(ctx.readOutbox()).toHaveLength(1);
});
