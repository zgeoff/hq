import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { freshDb } from '../../test/helpers.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { buildRunSeeder } from './test-utils/build-run-seeder.ts';
import { closeDoneDesignRuns } from './close-done-design-runs.ts';
import { reopenRun } from './reopen-run.ts';
import { readClosedIssueAlerts } from './read-closed-issue-alerts.ts';
import { readEvents } from '../read-events.ts';
import type { StubFleetAnswers } from '../../test/build-stub-fleet-client.ts';
import type { ImpWork } from './types.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const seed = buildRunSeeder(fresh);

  return {
    db: fresh.db,
    pinned: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    seed,
    addKettleIssue: (issue: string, state: 'open' | 'completed') => {
      writeIssues(fresh.db, [{ issue, type: 'Design', title: 'Invented kettle design', state, closed_at: state === 'open' ? null : '2026-10-21T01:02:03Z' }]);
    },
    addDesignRun: (issue: string) => seed.run({ issue, title: 'Invented kettle design', place: 'local', design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 } }),
    closeDesignRuns: (answers: StubFleetAnswers) => {
      const work: ImpWork = { state: 'pushed' };
      const fleet = buildStubFleetClient(answers);
      const closed = closeDoneDesignRuns(fresh.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve(work), readLocalWork: () => Promise.resolve(work) }, 'hq-lanes');
      return closed.then((result) => ({ issues: result.closed, errors: result.errors, calls: fleet.calls }));
    },
    readRuns: () => fresh.db.query('SELECT issue, state, close_note FROM runs ORDER BY issue').all(),
    readOutbox: () => fresh.db.query('SELECT target, text FROM outbox ORDER BY id').all(),
  };
}

test('it moves a design run whose issue is Done to done, and asks z-delivery once to close its pinned session', async () => {
  const ctx = setupTest();
  ctx.addDesignRun('GEO-9701');
  ctx.seed.runSession({ issue: 'GEO-9701', session: ctx.pinned });
  ctx.addKettleIssue('GEO-9701', 'completed');
  const answers = { sessions: [{ id: ctx.pinned, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] };

  const first = await ctx.closeDesignRuns(answers);
  const second = await ctx.closeDesignRuns(answers);

  expect(first).toStrictEqual({ issues: ['GEO-9701'], errors: [], calls: [] });
  expect(second).toStrictEqual({ issues: [], errors: [], calls: [] });
  expect(ctx.readRuns()).toStrictEqual([{ issue: 'GEO-9701', state: 'done', close_note: 'The Design issue is Done in Linear' }]);
  expect(ctx.readOutbox()).toStrictEqual([
    { target: 'z-delivery', text: `GEO-9701: its Design issue is Done in Linear, and the run is done. Unpin and stop session ${ctx.pinned}; hq does not stop a pinned session itself.` },
  ]);
});

test('it forgets an unpinned, fully pushed session of a closed design run and asks nobody', async () => {
  const ctx = setupTest();
  ctx.addDesignRun('GEO-9702');
  ctx.seed.runSession({ issue: 'GEO-9702', session: ctx.pinned });
  ctx.addKettleIssue('GEO-9702', 'completed');

  const closed = await ctx.closeDesignRuns({ sessions: [{ id: ctx.pinned, name: 'kettle-design', alive: true, cwd: '/workspace/kettle' }] });

  expect(closed).toStrictEqual({ issues: ['GEO-9702'], errors: [], calls: ['unpin 0000b001', 'kill 0000b001', 'unpin 0000b001', 'forget 0000b001'] });
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it leaves a design run whose issue is open, and its pinned session, alone', async () => {
  const ctx = setupTest();
  ctx.addDesignRun('GEO-9703');
  ctx.seed.runSession({ issue: 'GEO-9703', session: ctx.pinned });
  ctx.addKettleIssue('GEO-9703', 'open');

  const closed = await ctx.closeDesignRuns({ sessions: [{ id: ctx.pinned, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] });

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
  ctx.addDesignRun('GEO-9705');
  ctx.addKettleIssue('GEO-9705', 'completed');

  await ctx.closeDesignRuns({ sessions: [] });

  expect(readClosedIssueAlerts(ctx.db)).toStrictEqual([]);
});

test('it still closes the run and asks z-delivery to stop its active session, without calling it pinned, when atc fails', async () => {
  const ctx = setupTest();
  ctx.addDesignRun('GEO-9706');
  ctx.seed.runSession({ issue: 'GEO-9706', session: '0000c002-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  ctx.seed.runSession({ issue: 'GEO-9706', session: ctx.pinned });
  ctx.addKettleIssue('GEO-9706', 'completed');
  const closed = closeDoneDesignRuns(ctx.db, { openClient: () => Promise.reject(new Error('invented: atc is down')), readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');

  await expect(closed).resolves.toStrictEqual({ closed: ['GEO-9706'], errors: [] });
  expect(ctx.readRuns()).toStrictEqual([{ issue: 'GEO-9706', state: 'done', close_note: 'The Design issue is Done in Linear' }]);
  expect(ctx.readOutbox()).toStrictEqual([
    { target: 'z-delivery', text: `GEO-9706: its Design issue is Done in Linear, and the run is done. hq could not close session ${ctx.pinned} (atc: invented: atc is down); stop it if it is still running.` },
  ]);
  expect(readEvents(ctx.db, 'run', 'GEO-9706', ['design-done-close-session'])).toStrictEqual([
    { seq: expect.any(Number), action: 'design-done-close-session', actor: 'hq-lanes', at: expect.any(String), data: JSON.stringify({ session: ctx.pinned, why: 'failed', reason: 'atc: invented: atc is down' }) },
  ]);
});

test('it finishes a close that an earlier pass claimed and never finished, and asks z-delivery once', async () => {
  const ctx = setupTest();
  ctx.addDesignRun('GEO-9708');
  ctx.seed.runSession({ issue: 'GEO-9708', session: ctx.pinned });
  ctx.addKettleIssue('GEO-9708', 'completed');
  const stalled = Promise.withResolvers<never>();
  void closeDoneDesignRuns(ctx.db, { openClient: () => stalled.promise, readImpWork: () => Promise.resolve({ state: 'pushed' }), readLocalWork: () => Promise.resolve({ state: 'pushed' }) }, 'hq-lanes');
  const answers = { sessions: [{ id: ctx.pinned, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] };

  const finished = await ctx.closeDesignRuns(answers);

  expect(finished).toStrictEqual({ issues: [], errors: [], calls: [] });
  expect(ctx.readOutbox()).toStrictEqual([
    { target: 'z-delivery', text: `GEO-9708: its Design issue is Done in Linear, and the run is done. Unpin and stop session ${ctx.pinned}; hq does not stop a pinned session itself.` },
  ]);
});

test('it asks z-delivery only once about a session when its run is reopened and closed again', async () => {
  const ctx = setupTest();
  ctx.addDesignRun('GEO-9707');
  ctx.seed.runSession({ issue: 'GEO-9707', session: ctx.pinned });
  ctx.addKettleIssue('GEO-9707', 'completed');
  const answers = { sessions: [{ id: ctx.pinned, name: 'kettle-design', alive: true, pinned: true, cwd: '/workspace/kettle' }] };

  await ctx.closeDesignRuns(answers);
  reopenRun(ctx.db, { issue: 'GEO-9707', next: 'Reopened: agent working.', design: { slots: { agent: 2, withGeoff: 1 }, error: null, asked: null }, actor: 'hq-lanes' });
  const again = await ctx.closeDesignRuns(answers);

  expect(again.issues).toStrictEqual(['GEO-9707']);
  expect(ctx.readOutbox()).toHaveLength(1);
});
