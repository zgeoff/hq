// oxlint-disable zgeoff/test-beside-module -- the whole-program follow-ups suite, across every module in src/followups
import { expect, onTestFinished, test } from 'bun:test';
import { addBackfill } from '../src/followups/add-backfill.ts';
import { dropFollowup } from '../src/followups/drop-followup.ts';
import { listFollowups } from '../src/followups/list-followups.ts';
import { parseFixed } from '../src/followups/parse-fixed.ts';
import { parseFollowups } from '../src/followups/parse-followups.ts';
import { reviewStats } from '../src/followups/review-stats.ts';
import { reviewText } from '../src/followups/review-text.ts';
import { addMark } from '../src/marks/add-mark.ts';
import { addPr } from '../src/runs/add-pr.ts';
import { addRun } from '../src/runs/add-run.ts';
import { finalPr } from '../src/runs/final-pr.ts';
import { at, freshDb } from './helpers.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    addRun: (issue: string) => addRun(fresh.db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' }),
  };
}

test.each([
  ['GEO-1,teapot', '"TEAPOT" isn\'t one'],
  ['GEO-1;GEO-2', "isn't one"],
  ['GEO-', "isn't one"],
  ['https://linear.app/x/issue/GEO-1', "isn't one"],
  ['GEO-1 OR 1=1', "isn't one"],
])('it refuses --followups %p', (raw, why) => expect(() => parseFollowups(raw)).toThrow(why));

test.each(['-1', '1.5', 'three', '', '2e3', '0x10', '1'.padEnd(310, '0'), '9007199254740993', '10001'])('it refuses --fixed %p', (raw) => expect(() => parseFixed(raw)).toThrow('whole number'));

test.each<[Parameters<typeof addBackfill>[1], string]>([
  [{ issue: 'teapot', fromRef: null, at: '2026-10-12T12:00:00Z', actor: 'z-q' }, 'not an issue id'],
  [{ issue: 'GEO-5', fromRef: 'kettle', at: '2026-10-12T12:00:00Z', actor: 'z-q' }, '--from must be repo#n'],
  [{ issue: 'GEO-5', fromRef: '../kettle#1', at: '2026-10-12T12:00:00Z', actor: 'z-q' }, '--from must be repo#n'],
  [{ issue: 'GEO-5', fromRef: null, at: 'last week', actor: 'z-q' }, '--at must be a time'],
  [{ issue: 'GEO-5', fromRef: null, at: '2026-10-17T12:00:00Z', actor: 'z-q' }, 'in the future'],
])('it refuses a backfill of %p', (input, why) => {
  const ctx = setupTest();
  at('2026-10-15T12:00:00Z');

  expect(() => addBackfill(ctx.db, input)).toThrow(why);
});

test('it parses follow-ups and counts, and records nothing when both are left off', () => {
  const ctx = setupTest();
  at('2026-10-15T12:00:00Z');
  expect(parseFollowups(' geo-12, GEO-13 ,GEO-12')).toStrictEqual(['GEO-12', 'GEO-13']);
  expect(parseFollowups(undefined)).toBeNull();
  expect(parseFixed('0')).toBe(0);
  expect(parseFixed(undefined)).toBeNull();
  addMark(ctx.db, { kind: 'skills', text: '#135: findings fixed in their own PR', ref: 'nixie-definitions#135', at: '2026-10-15T12:00:00Z', actor: 'z-steward' });
  ctx.addRun('GEO-1');
  addPr(ctx.db, 'GEO-1', 'kettle#1', 'z-delivery');
  finalPr(ctx.db, 'kettle#1', { sha: 'abc1234', actor: 'z-delivery', tally: { fixed: null, followups: null } });
  expect(ctx.db.query('SELECT fixed_in_pr, tally_at FROM run_prs').get()).toStrictEqual({ fixed_in_pr: null, tally_at: null });
  expect(ctx.db.query(`SELECT COUNT(*) AS count FROM events WHERE action = 'tally'`).get()).toStrictEqual({ count: 0 });
});

test('it counts the weeks around the rule: a hand-counted baseline before, PR tallies after', () => {
  const ctx = setupTest();
  at('2026-10-15T12:00:00Z');
  addMark(ctx.db, { kind: 'skills', text: '#135: findings fixed in their own PR', ref: 'nixie-definitions#135', at: '2026-10-15T12:00:00Z', actor: 'z-steward' });
  addBackfill(ctx.db, { issue: 'GEO-101', fromRef: 'kettle#40', at: '2026-10-03T12:00:00Z', actor: 'z-q' });
  addBackfill(ctx.db, { issue: 'GEO-102', fromRef: null, at: '2026-10-06T12:00:00Z', actor: 'z-q' });
  addBackfill(ctx.db, { issue: 'GEO-103', fromRef: 'teapot#7', at: '2026-10-13T12:00:00Z', actor: 'z-q' });
  expect(() => addBackfill(ctx.db, { issue: 'geo-103', fromRef: null, at: '2026-10-13T12:00:00Z', actor: 'z-q' })).toThrow('already counted');
  at('2026-10-18T12:00:00Z');
  ctx.addRun('GEO-1');
  addPr(ctx.db, 'GEO-1', 'kettle#1', 'z-delivery');
  finalPr(ctx.db, 'kettle#1', { sha: 'abc1234', actor: 'z-delivery', tally: { fixed: 4, followups: ['GEO-200'] } });
  at('2026-10-19T12:00:00Z');
  ctx.addRun('GEO-2');
  addPr(ctx.db, 'GEO-2', 'kettle#2', 'z-delivery');
  finalPr(ctx.db, 'kettle#2', { sha: 'def5678', actor: 'z-delivery', tally: { fixed: 0, followups: null } });

  finalPr(ctx.db, 'kettle#2', { sha: 'def5678', actor: 'z-delivery', tally: { fixed: 2, followups: null } });
  at('2026-10-24T12:00:00Z');
  const stats = reviewStats(ctx.db);
  expect(stats.baseline).toStrictEqual({ followupsPerWeek: 1.5, backfilled: 3, fixed: 'none' });
  expect(stats.weeks.map((week) => [week.week, week.followups, week.fixed, week.tallied, week.partialDays])).toStrictEqual([
    [-2, 2, 0, 0, null],
    [-1, 1, 0, 0, null],
    [1, 1, 6, 2, null],
    [2, 0, 0, 0, 2],
  ]);
  const text = reviewText(stats).join('\n');
  expect(text).toContain('baseline, the 2 weeks before: 1.5 follow-ups a week (3 counted by hand from Linear, "linear backfill"); same-PR fixes: no baseline');
  expect(text).toContain('week +1 10-15→10-22');
  expect(text).toContain('follow-ups 1; same-PR fixes 6 across 2 PRs');
  expect(text).toContain('week +2 10-22→10-24 (2d so far)');
  expect(listFollowups(ctx.db).map((followup) => [followup.issue, followup.source])).toStrictEqual([
    ['GEO-101', 'linear backfill'],
    ['GEO-102', 'linear backfill'],
    ['GEO-103', 'linear backfill'],
    ['GEO-200', 'final'],
  ]);
  expect(dropFollowup(ctx.db, 'geo-102', 'z-q')).toBe(true);
  expect(dropFollowup(ctx.db, 'GEO-102', 'z-q')).toBe(false);
});

test('it says how to add the rule mark when there is none', () => {
  const ctx = setupTest();
  at('2026-10-15T12:00:00Z');

  expect(reviewText(reviewStats(ctx.db)).join('\n')).toContain('no mark for nixie-definitions#135');
});
