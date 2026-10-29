import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
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

let db: Database;
let cleanup: () => void;
const RULE = '2026-10-15T12:00:00Z';
const day = (d: number) => new Date(Date.parse(RULE) + d * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at(day(0));
  addMark(db, { kind: 'skills', text: '#135: findings fixed in their own PR', ref: 'nixie-definitions#135', at: RULE, actor: 'z-steward' });
});
afterEach(() => cleanup());

const run = (issue: string) => addRun(db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });

// Inputs the new checks must refuse.
const HOSTILE_FOLLOWUPS: [string, string][] = [
  ['GEO-1,teapot', '"TEAPOT" isn\'t one'],
  ['GEO-1;GEO-2', "isn't one"],
  ['GEO-', "isn't one"],
  ['https://linear.app/x/issue/GEO-1', "isn't one"],
  ['GEO-1 OR 1=1', "isn't one"],
];
test.each(HOSTILE_FOLLOWUPS)('--followups refuses %p', (raw, why) => expect(() => parseFollowups(raw)).toThrow(why));

const HOSTILE_FIXED = ['-1', '1.5', 'three', '', '2e3', '0x10', '1'.padEnd(310, '0'), '9007199254740993', '10001'];
test.each(HOSTILE_FIXED)('--fixed refuses %p', (raw) => expect(() => parseFixed(raw)).toThrow('whole number'));

const HOSTILE_BACKFILL: [Parameters<typeof addBackfill>[1], string][] = [
  [{ issue: 'teapot', fromRef: null, at: day(-3), actor: 'z-q' }, 'not an issue id'],
  [{ issue: 'GEO-5', fromRef: 'kettle', at: day(-3), actor: 'z-q' }, '--from must be repo#n'],
  [{ issue: 'GEO-5', fromRef: '../kettle#1', at: day(-3), actor: 'z-q' }, '--from must be repo#n'],
  [{ issue: 'GEO-5', fromRef: null, at: 'last week', actor: 'z-q' }, '--at must be a time'],
  [{ issue: 'GEO-5', fromRef: null, at: day(2), actor: 'z-q' }, 'in the future'],
];
test.each(HOSTILE_BACKFILL)('a backfill refuses %p', (input, why) => expect(() => addBackfill(db, input)).toThrow(why));

test('parses follow-ups and counts; leaving both off records nothing', () => {
  expect(parseFollowups(' geo-12, GEO-13 ,GEO-12')).toEqual(['GEO-12', 'GEO-13']);
  expect(parseFollowups(undefined)).toBeNull();
  expect(parseFixed('0')).toBe(0);
  expect(parseFixed(undefined)).toBeNull();
  run('GEO-1');
  addPr(db, 'GEO-1', 'kettle#1', 'z-delivery');
  finalPr(db, 'kettle#1', { sha: 'abc1234', actor: 'z-delivery', tally: { fixed: null, followups: null } });
  expect(db.query('SELECT fixed_in_pr, tally_at FROM run_prs').get()).toEqual({ fixed_in_pr: null, tally_at: null });
  expect(db.query(`SELECT COUNT(*) AS n FROM events WHERE action = 'tally'`).get()).toEqual({ n: 0 });
});

test('weekly counts around the rule: a hand-counted baseline before, PR tallies after', () => {
  addBackfill(db, { issue: 'GEO-101', fromRef: 'kettle#40', at: day(-12), actor: 'z-q' });
  addBackfill(db, { issue: 'GEO-102', fromRef: null, at: day(-9), actor: 'z-q' });
  addBackfill(db, { issue: 'GEO-103', fromRef: 'teapot#7', at: day(-2), actor: 'z-q' });
  expect(() => addBackfill(db, { issue: 'geo-103', fromRef: null, at: day(-2), actor: 'z-q' })).toThrow('already counted');
  at(day(3));
  run('GEO-1');
  addPr(db, 'GEO-1', 'kettle#1', 'z-delivery');
  finalPr(db, 'kettle#1', { sha: 'abc1234', actor: 'z-delivery', tally: { fixed: 4, followups: ['GEO-200'] } });
  at(day(4));
  run('GEO-2');
  addPr(db, 'GEO-2', 'kettle#2', 'z-delivery');
  finalPr(db, 'kettle#2', { sha: 'def5678', actor: 'z-delivery', tally: { fixed: 0, followups: null } });

  // said again: replaces
  finalPr(db, 'kettle#2', { sha: 'def5678', actor: 'z-delivery', tally: { fixed: 2, followups: null } });
  at(day(9));
  const s = reviewStats(db);
  expect(s.baseline).toEqual({ followupsPerWeek: 1.5, backfilled: 3, fixed: 'none' });
  expect(s.weeks.map((w) => [w.week, w.followups, w.fixed, w.tallied, w.partialDays])).toEqual([
    [-2, 2, 0, 0, null],
    [-1, 1, 0, 0, null],
    [1, 1, 6, 2, null],
    [2, 0, 0, 0, 2],
  ]);
  const text = reviewText(s).join('\n');
  expect(text).toContain('baseline, the 2 weeks before: 1.5 follow-ups a week (3 counted by hand from Linear, "linear backfill"); same-PR fixes: no baseline');
  expect(text).toContain('week +1 10-15→10-22');
  expect(text).toContain('follow-ups 1; same-PR fixes 6 across 2 PRs');
  expect(text).toContain('week +2 10-22→10-24 (2d so far)');
  expect(listFollowups(db).map((f) => [f.issue, f.source])).toEqual([
    ['GEO-101', 'linear backfill'],
    ['GEO-102', 'linear backfill'],
    ['GEO-103', 'linear backfill'],
    ['GEO-200', 'final'],
  ]);
  expect(dropFollowup(db, 'geo-102', 'z-q')).toBe(true);
  expect(dropFollowup(db, 'GEO-102', 'z-q')).toBe(false);
});

test('without the rule mark, the section says how to add it', () => {
  db.query('DELETE FROM marks').run();
  expect(reviewText(reviewStats(db)).join('\n')).toContain('no mark for nixie-definitions#135');
});
