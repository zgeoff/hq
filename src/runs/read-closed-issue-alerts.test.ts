import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { findAlerts } from './find-alerts.ts';
import { readClosedIssueAlerts } from './read-closed-issue-alerts.ts';
import { setLiveCheck } from './set-live-check.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    addKettleRun: (issue: string) => {
      addRun(fresh.db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
    },
    closeInLinear: (issue: string, state: 'completed' | 'canceled') => {
      writeIssues(fresh.db, [{ issue, type: 'none', title: 'Invented kettle work', state, closed_at: '2026-10-21T01:02:03Z' }]);
    },
  };
}

test('it raises nothing for a run whose issue is open in Linear or unknown to hq', () => {
  const ctx = setupTest();
  ctx.addKettleRun('GEO-9811');
  ctx.addKettleRun('GEO-9812');
  writeIssues(ctx.db, [{ issue: 'GEO-9811', type: 'none', title: 'Invented kettle work', state: 'open', closed_at: null }]);

  expect(readClosedIssueAlerts(ctx.db)).toStrictEqual([]);
});

test('it raises nothing for a merged run on its way to live, owed a check or not, since a Fixes merge closes the issue early', () => {
  const ctx = setupTest();
  ctx.addKettleRun('GEO-9813');
  addPr(ctx.db, 'GEO-9813', 'kettle#13', 'kettle-bot');
  closePr(ctx.db, 'kettle#13', { to: 'merged', actor: 'kettle-bot' });
  ctx.closeInLinear('GEO-9813', 'completed');

  expect(readClosedIssueAlerts(ctx.db)).toStrictEqual([]);
});

test('it tells done from dropped for each closed issue by what the run still owes', () => {
  const ctx = setupTest();
  ctx.addKettleRun('GEO-9821');
  ctx.closeInLinear('GEO-9821', 'canceled');
  ctx.addKettleRun('GEO-9822');
  addPr(ctx.db, 'GEO-9822', 'kettle#22', 'kettle-bot');
  closePr(ctx.db, 'kettle#22', { to: 'merged', actor: 'kettle-bot' });
  ctx.closeInLinear('GEO-9822', 'canceled');
  ctx.addKettleRun('GEO-9823');
  addPr(ctx.db, 'GEO-9823', 'kettle#23', 'kettle-bot');
  ctx.closeInLinear('GEO-9823', 'completed');
  ctx.addKettleRun('GEO-9824');
  ctx.closeInLinear('GEO-9824', 'completed');
  ctx.addKettleRun('GEO-9825');
  addPr(ctx.db, 'GEO-9825', 'kettle#25', 'kettle-bot');
  closePr(ctx.db, 'kettle#25', { to: 'merged', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9825', 'live-check', {}, 'kettle-bot');
  ctx.closeInLinear('GEO-9825', 'completed');
  ctx.addKettleRun('GEO-9826');
  addPr(ctx.db, 'GEO-9826', 'kettle#26', 'kettle-bot');
  closePr(ctx.db, 'kettle#26', { to: 'merged', actor: 'kettle-bot' });
  setLiveCheck(ctx.db, 'GEO-9826', 'none', 'kettle-bot');
  ctx.closeInLinear('GEO-9826', 'completed');
  ctx.addKettleRun('GEO-9827');
  addPr(ctx.db, 'GEO-9827', 'kettle#27', 'kettle-bot');
  closePr(ctx.db, 'kettle#27', { to: 'merged', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9827', 'blocked', {}, 'kettle-bot');
  ctx.closeInLinear('GEO-9827', 'completed');

  expect(readClosedIssueAlerts(ctx.db)).toStrictEqual([
    { key: 'linear:GEO-9821', fingerprint: 'canceled:working', issue: 'GEO-9821', line: 'GEO-9821: Canceled in Linear while hq has it working; hq run drop GEO-9821' },
    {
      key: 'linear:GEO-9822',
      fingerprint: 'canceled:merged',
      issue: 'GEO-9822',
      line: 'GEO-9822: Canceled in Linear while hq has it merged; canceled after a merge: hq run drop GEO-9822, or reopen the issue',
    },
    { key: 'linear:GEO-9823', fingerprint: 'completed:working', issue: 'GEO-9823', line: 'GEO-9823: Done in Linear while hq has it working; a PR is still open, so look before you close the run' },
    {
      key: 'linear:GEO-9824',
      fingerprint: 'completed:working',
      issue: 'GEO-9824',
      line: 'GEO-9824: Done in Linear while hq has it working; done with no merged PR: hq run done GEO-9824 or hq run drop GEO-9824',
    },
    { key: 'linear:GEO-9825', fingerprint: 'completed:live-check', issue: 'GEO-9825', line: 'GEO-9825: Done in Linear while hq has it live-check; if the live check passed, hq run done GEO-9825' },
    {
      key: 'linear:GEO-9827',
      fingerprint: 'completed:blocked',
      issue: 'GEO-9827',
      line: 'GEO-9827: Done in Linear while hq has it blocked; its PRs merged: hq run state GEO-9827 merged, or hq run done GEO-9827',
    },
  ]);
});

test('it skips a run hq already closed', () => {
  const ctx = setupTest();
  ctx.addKettleRun('GEO-9831');
  setState(ctx.db, 'GEO-9831', 'done', {}, 'kettle-bot');
  ctx.closeInLinear('GEO-9831', 'completed');

  expect(readClosedIssueAlerts(ctx.db)).toStrictEqual([]);
});

test('the sweep\'s alert list carries the closed-issue alert', () => {
  const ctx = setupTest();
  ctx.addKettleRun('GEO-9832');
  ctx.closeInLinear('GEO-9832', 'completed');

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    {
      key: 'linear:GEO-9832',
      fingerprint: 'completed:working',
      issue: 'GEO-9832',
      line: 'GEO-9832: Done in Linear while hq has it working; done with no merged PR: hq run done GEO-9832 or hq run drop GEO-9832',
    },
  ]);
});
