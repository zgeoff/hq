import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { dropCanceledRuns } from './drop-canceled-runs.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    addKettleRun: (issue: string, linear: 'open' | 'completed' | 'canceled') => {
      addRun(fresh.db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
      writeIssues(fresh.db, [{ issue, type: 'none', title: 'Invented kettle work', state: linear, closed_at: linear === 'open' ? null : '2026-10-21T01:02:03Z' }]);
    },
  };
}

test('it drops a canceled run with no open or merged PR, notes why, and tells z-delivery once', () => {
  const ctx = setupTest();
  ctx.addKettleRun('GEO-9841', 'canceled');
  ctx.addKettleRun('GEO-9842', 'canceled');
  addPr(ctx.db, 'GEO-9842', 'kettle#42', 'kettle-bot');
  closePr(ctx.db, 'kettle#42', { to: 'closed', actor: 'kettle-bot' });

  const dropped = dropCanceledRuns(ctx.db, 'hq-lanes');

  expect(dropped).toStrictEqual(['GEO-9841', 'GEO-9842']);
  expect(ctx.db.query("SELECT issue, state, close_note FROM runs WHERE issue LIKE 'GEO-984%' ORDER BY issue").all()).toStrictEqual([
    { issue: 'GEO-9841', state: 'dropped', close_note: 'Linear canceled the issue before any PR merged' },
    { issue: 'GEO-9842', state: 'dropped', close_note: 'Linear canceled the issue before any PR merged' },
  ]);
  expect(ctx.db.query('SELECT target, text FROM outbox').all()).toStrictEqual([
    {
      target: 'z-delivery',
      text: 'hq dropped GEO-9841, GEO-9842: Linear canceled each issue, and its run had no open or merged PR. Reopen with hq run reopen <issue> if that is wrong.',
    },
  ]);
});

test('it keeps a canceled run with an open or merged PR, and every run whose issue is open or done', () => {
  const ctx = setupTest();
  ctx.addKettleRun('GEO-9851', 'canceled');
  addPr(ctx.db, 'GEO-9851', 'kettle#51', 'kettle-bot');
  ctx.addKettleRun('GEO-9852', 'canceled');
  addPr(ctx.db, 'GEO-9852', 'kettle#52', 'kettle-bot');
  closePr(ctx.db, 'kettle#52', { to: 'merged', actor: 'kettle-bot' });
  ctx.addKettleRun('GEO-9853', 'open');
  ctx.addKettleRun('GEO-9854', 'completed');

  expect(dropCanceledRuns(ctx.db, 'hq-lanes')).toStrictEqual([]);
  expect(ctx.db.query("SELECT state FROM runs WHERE issue LIKE 'GEO-985%' ORDER BY issue").all()).toStrictEqual([{ state: 'working' }, { state: 'merged' }, { state: 'working' }, { state: 'working' }]);
  expect(ctx.db.query('SELECT count(*) AS queued FROM outbox').get()).toStrictEqual({ queued: 0 });
});
