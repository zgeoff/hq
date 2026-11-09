// oxlint-disable zgeoff/test-beside-module -- grandfathered: the whole-program stats suite
import { afterEach, beforeEach, expect, onTestFinished, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';
import { listEvents } from '../src/list-events.ts';
import { addAsk } from '../src/asks/add-ask.ts';
import { answerAsk } from '../src/asks/answer-ask.ts';
import { applyAsk } from '../src/asks/apply-ask.ts';
import { addMark } from '../src/marks/add-mark.ts';
import { dropMark } from '../src/marks/drop-mark.ts';
import { listMarks } from '../src/marks/list-marks.ts';
import { markVersion } from '../src/marks/mark-version.ts';
import { addPr } from '../src/runs/add-pr.ts';
import { addRun } from '../src/runs/add-run.ts';
import { closePr } from '../src/runs/close-pr.ts';
import { reviewedPr } from '../src/runs/reviewed-pr.ts';
import { setState } from '../src/runs/set-state.ts';
import { unmergePr } from '../src/runs/unmerge-pr.ts';
import { computeStats } from '../src/stats/compute-stats.ts';
import { dist } from '../src/stats/dist.ts';
import { headline } from '../src/stats/headline.ts';
import { statsText } from '../src/stats/stats-text.ts';
import { at, freshDb } from './helpers.ts';
import { writeLanesNudgeFollowUp } from '../src/lanes/write-lanes-nudge-follow-up.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';

let db: Database;
let cleanup: () => void;

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at('2026-10-16T01:00:00Z');
});
afterEach(() => cleanup());

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-16T01:00:00Z');

  return { db: fresh.db, seed: buildSeeder(fresh) };
}

const run = (issue: string, readySince: string | null = null) =>
  addRun(db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, readySince, actor: 'z-delivery' });

test('median and p90 by nearest rank; under 5 samples is thin', () => {
  expect(dist([30, 10, 20])).toEqual({ n: 3, medianMin: 20, p90Min: 30, thin: true });
  expect(dist([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toMatchObject({ medianMin: 5, p90Min: 9, thin: false });
  expect(dist([])).toEqual({ n: 0, medianMin: null, p90Min: null, thin: true });
});

test('wait on the owner: call queue → answer → apply, and run time waiting on the owner, exact or by the word', () => {
  addAsk(db, { kind: 'call', id: 'kettle-colour', title: 'Kettle colour', question: 'Red or blue?', body: 'Invented.', issues: [], forSession: null, actor: 'z-triage' });
  at('2026-10-16T01:05:00Z');
  db.query("UPDATE asks SET state = 'open', opened_at = ? WHERE id = 'kettle-colour'").run('2026-10-16T01:05:00Z');
  at('2026-10-16T02:05:00Z');
  answerAsk(db, { id: 'kettle-colour', kind: 'call', answer: 'Blue.', actor: 'z-stu' });
  at('2026-10-16T02:15:00Z');
  applyAsk(db, 'kettle-colour', 'call', 'linear:GEO-1', 'done', 'z-stu');

  run('GEO-1');
  setState(db, 'GEO-1', 'blocked', { waitsOn: "Geoff's yes" }, 'z-delivery');
  at('2026-10-16T03:15:00Z');
  setState(db, 'GEO-1', 'working', { waitsOn: null }, 'z-delivery');
  run('GEO-2');
  setState(db, 'GEO-2', 'blocked', { waitsOn: 'a release', waitsOnGeoff: true }, 'z-delivery');
  at('2026-10-16T03:45:00Z');
  const stats = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T03:45:00Z', gh: null });
  expect(stats.geoff.queueToAnswer).toMatchObject({ medianMin: 65 });
  expect(stats.geoff.queueToAnswer.n).toBe(1);
  expect(stats.geoff.answerToApply).toMatchObject({ medianMin: 10 });
  expect(stats.geoff.answerToApply.n).toBe(1);
  expect(stats.geoff.runGeoffWait.n).toBe(2);
  expect(stats.geoff.oldestRunWait).toStrictEqual({ id: 'GEO-2', ageMin: 30 });
  expect(stats.geoff.runWaitExactShare).toBe(0.33);
  expect(statsText(stats)).toContain('67% matched by the word "Geoff" or "the owner"');
});

test('it counts a wait as exact only from when the explicit flag was set', () => {
  run('GEO-1');
  setState(db, 'GEO-1', 'blocked', { waitsOn: "Geoff's yes" }, 'z-delivery');
  at('2026-10-16T01:10:00Z');
  setState(db, 'GEO-1', 'blocked', { waitsOn: "Geoff's yes", waitsOnGeoff: true }, 'z-delivery');
  at('2026-10-16T01:20:00Z');
  setState(db, 'GEO-1', 'working', { waitsOn: null, waitsOnGeoff: false }, 'z-delivery');

  const stats = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T01:30:00Z', gh: null });

  expect([stats.geoff.runGeoffWait.medianMin, stats.geoff.runWaitExactShare]).toStrictEqual([20, 0.5]);
});

test('a run blocked on "the owner" counts as waiting on the owner, as one blocked on "Geoff" does', () => {
  run('GEO-1');
  setState(db, 'GEO-1', 'blocked', { waitsOn: "the owner's yes" }, 'z-delivery');
  at('2026-10-16T01:40:00Z');
  setState(db, 'GEO-1', 'working', { waitsOn: null }, 'z-delivery');
  run('GEO-2');
  setState(db, 'GEO-2', 'blocked', { waitsOn: 'the ownership papers' }, 'z-delivery');
  at('2026-10-16T02:00:00Z');
  const stats = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T02:00:00Z', gh: null });
  expect(stats.geoff.runGeoffWait.n).toBe(1);
  expect(stats.geoff.runGeoffWait.medianMin).toBe(40);
});

test('merged to live, the backlog by repo, review rework and cycle time', () => {
  run('GEO-1', '2026-10-15T23:00:00Z');
  addPr(db, 'GEO-1', 'widgets#1', 'z-delivery');
  reviewedPr(db, 'widgets#1', 'abc1234', { recheck: false, force: false }, 'z-delivery');
  reviewedPr(db, 'widgets#1', 'abc1234', { recheck: true, force: false }, 'z-delivery');
  at('2026-10-16T01:30:00Z');
  closePr(db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  setState(db, 'GEO-1', 'merged', {}, 'z-delivery');
  at('2026-10-16T03:30:00Z');
  setState(db, 'GEO-1', 'done', {}, 'z-delivery');
  run('GEO-2');
  addPr(db, 'GEO-2', 'gadgets#2', 'z-delivery');
  reviewedPr(db, 'gadgets#2', 'def5678', { recheck: false, force: false }, 'z-delivery');
  closePr(db, 'gadgets#2', { to: 'merged', actor: 'z-delivery' });
  setState(db, 'GEO-2', 'deploy-held', {}, 'z-delivery');
  at('2026-10-16T04:30:00Z');
  const stats = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T04:30:00Z', gh: null });
  expect(stats.live.mergeToDone).toMatchObject({ medianMin: 120 });
  expect(stats.live.mergeToDone.n).toBe(1);
  expect(stats.live.byRepo['widgets']?.n).toBe(1);
  expect(stats.live.backlog).toStrictEqual({ total: 1, byRepo: { gadgets: 1 }, oldest: { id: 'GEO-2', ageMin: 60 } });
  expect(stats.flow).toMatchObject({ reviewed: 2, rechecked: 1, reworkShare: 0.5, cycleFromReady: 1 });
  expect(stats.flow.cycle.medianMin).toBe(270);
  expect(stats.flow.mergesSource).toBe('hq');
  expect(headline(stats)).toContain('merge→live 2.0h (n=1), 1 waiting');
});

test('it times merged to live from when GitHub merged the PR, not from when hq saw it', () => {
  run('GEO-1');
  addPr(db, 'GEO-1', 'widgets#1', 'z-delivery');
  at('2026-10-16T01:10:00Z');
  closePr(db, 'widgets#1', { to: 'merged', actor: 'github', facts: { mergedAt: '2026-10-16T01:00:00Z', mergeSha: null } });
  setState(db, 'GEO-1', 'merged', {}, 'z-delivery');
  at('2026-10-16T01:20:00Z');
  setState(db, 'GEO-1', 'done', {}, 'z-delivery');

  const live = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T01:30:00Z', gh: null }).live;
  expect(live.mergeToDone.n).toBe(1);
  expect(live.mergeToDone.medianMin).toBe(20);
});

test('it takes the latest GitHub merge time as the last merge, whatever order hq saw the merges in', () => {
  run('GEO-1');
  addPr(db, 'GEO-1', 'widgets#1', 'z-delivery');
  addPr(db, 'GEO-1', 'widgets#2', 'z-delivery');
  run('GEO-2');
  addPr(db, 'GEO-2', 'widgets#3', 'z-delivery');
  addPr(db, 'GEO-2', 'gadgets#4', 'z-delivery');
  at('2026-10-16T03:10:00Z');
  closePr(db, 'widgets#1', { to: 'merged', actor: 'github', facts: { mergedAt: '2026-10-16T03:00:00Z', mergeSha: null } });
  closePr(db, 'widgets#2', { to: 'merged', actor: 'github', facts: { mergedAt: '2026-10-16T02:00:00Z', mergeSha: null } });
  closePr(db, 'gadgets#4', { to: 'merged', actor: 'github', facts: { mergedAt: '2026-10-16T02:50:00Z', mergeSha: null } });
  closePr(db, 'widgets#3', { to: 'merged', actor: 'github', facts: { mergedAt: '2026-10-16T01:50:00Z', mergeSha: null } });
  setState(db, 'GEO-1', 'merged', {}, 'z-delivery');
  setState(db, 'GEO-2', 'merged', {}, 'z-delivery');
  at('2026-10-16T04:00:00Z');
  setState(db, 'GEO-1', 'done', {}, 'z-delivery');

  const live = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T04:10:00Z', gh: null }).live;

  expect([live.mergeToDone.medianMin, live.backlog]).toStrictEqual([60, { total: 1, byRepo: { gadgets: 1 }, oldest: { id: 'GEO-2', ageMin: 80 } }]);
});

test('idle capacity counts only while Ready work waited; a stale count is flagged; nudges convert', () => {
  const ctx = setupTest();
  ctx.seed.lanesSample({ at: '2026-10-16T01:00:00Z', slots: 2, eligible: 3 });
  ctx.seed.lanesSample({ at: '2026-10-16T01:10:00Z', slots: 2, eligible: 0 });
  ctx.seed.lanesSample({ at: '2026-10-16T01:20:00Z', slots: 1, eligible: null });
  ctx.seed.lanesSample({ at: '2026-10-16T01:30:00Z', slots: 0, eligible: 4 });
  const firstNudge = ctx.seed.lanesNudge({ at: '2026-10-16T01:01:00Z', slots: 2, eligible: 3 });
  const secondNudge = ctx.seed.lanesNudge({ at: '2026-10-16T01:11:00Z', slots: 2, eligible: 3 });
  ctx.seed.lanesNudge({ at: '2026-10-16T01:21:00Z', slots: 1, eligible: null });
  writeLanesNudgeFollowUp(ctx.db, firstNudge, 0, '2026-10-16T01:31:00Z');
  writeLanesNudgeFollowUp(ctx.db, secondNudge, 2, '2026-10-16T01:41:00Z');
  const stats = computeStats(ctx.db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T01:40:00Z', gh: null });
  expect(stats.idle).toStrictEqual({ slotMinutesWhileReady: 20, slotMinutesUnknown: 10, staleShare: 0.25, samples: 4, nudges: 3, nudgesConverted: 1, nudgesPending: 1 });
  expect(statsText(stats)).toContain('READY COUNT STALE in 25% of 4 samples: no fresh per-lane Ready report');
});

test('a merge that hq run unmerge took back is not counted', () => {
  run('GEO-1');
  addPr(db, 'GEO-1', 'widgets#5', 'z-delivery');
  addPr(db, 'GEO-1', 'gadgets#6', 'z-delivery');
  at('2026-10-16T01:10:00Z');
  closePr(db, 'widgets#5', { to: 'merged', actor: 'z-review' });
  closePr(db, 'gadgets#6', { to: 'merged', actor: 'z-review' });
  at('2026-10-16T01:20:00Z');
  unmergePr(db, 'widgets#5', 'z-review', 'the merge failed on a conflict');
  const stats = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T02:00:00Z', gh: null });
  expect(stats.flow).toMatchObject({ mergesSource: 'hq', mergesPerDay: { gadgets: 1 } });
  expect(stats.flow.mergesPerDay['widgets']).toBeUndefined();
});

test('GitHub merges per day by repo replace the tracked count when given', () => {
  const stats = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-18T01:00:00Z', gh: [{ repo: 'widgets', mergedAt: '2026-10-16T01:05:00Z' }, { repo: 'widgets', mergedAt: '2026-10-17T02:00:00Z' }, { repo: 'gadgets', mergedAt: '2026-10-16T01:10:00Z' }, { repo: 'gadgets', mergedAt: '2026-10-01T00:00:00Z' }] });
  expect(stats.flow).toMatchObject({ mergesSource: 'github', days: 2, mergesPerDay: { widgets: 1, gadgets: 0.5 } });
});

test('rows from before the cutoff are left out', () => {
  at('2026-10-14T13:00:00Z');
  run('GEO-1');
  setState(db, 'GEO-1', 'blocked', { waitsOn: 'Geoff' }, 'z-delivery');
  at('2026-10-16T02:00:00Z');
  const stats = computeStats(db, { from: '2026-10-14T00:00:00Z', to: '2026-10-16T02:00:00Z', gh: null });
  expect(stats.window.from).toBe('2026-10-14T20:00:00Z');
  expect(stats.geoff.runGeoffWait.n).toBe(0);
});

test('marks: add, refuse bad ones, list, and one per hq version', () => {
  const m = addMark(db, { kind: 'grant', text: 'Stu decisions grant on (GEO-904)', ref: 'GEO-904', at: '2026-10-15T07:00:00Z', actor: 'z-q' });
  expect(m).toMatchObject({ id: 1, at: '2026-10-15T07:00:00Z', kind: 'grant' });
  expect(() => addMark(db, { kind: 'mood', text: 'x', ref: null, at: null, actor: 'z-q' })).toThrow('--kind');
  expect(() => addMark(db, { kind: 'other', text: 'x', ref: null, at: '2027-01-01T00:00:00Z', actor: 'z-q' })).toThrow('future');
  expect(markVersion(db, '9.9.9', 'hq-lanes')?.text).toBe('hq 9.9.9 running');
  expect(markVersion(db, '9.9.9', 'hq-lanes')).toBeNull();
  expect(listMarks(db).map((x) => x.kind)).toEqual(['grant', 'hq']);
});

test('it keeps no version mark when the checkpoint write fails, so the next run marks the version once', () => {
  db.exec("CREATE TEMP TRIGGER refuse_checkpoint BEFORE INSERT ON meta WHEN NEW.key = 'marked_version' BEGIN SELECT RAISE(ABORT, 'invented refusal'); END");
  expect(() => markVersion(db, '9.9.9', 'hq-lanes')).toThrow('invented refusal');
  db.exec('DROP TRIGGER refuse_checkpoint');
  markVersion(db, '9.9.9', 'hq-lanes');
  expect(listMarks(db).map((mark) => mark.text)).toStrictEqual(['hq 9.9.9 running']);
});

test('drop removes a mistaken mark and keeps what it said in the event', () => {
  const m = addMark(db, { kind: 'skills', text: 'Invented skills tidy-up', ref: 'widgets#3', at: null, actor: 'z-steward' });
  expect(dropMark(db, m.id, 'z-q')?.text).toBe('Invented skills tidy-up');
  expect(listMarks(db)).toHaveLength(0);
  expect(dropMark(db, m.id, 'z-q')).toBeNull();
  const [ev] = listEvents(db, 'mark-dropped');
  invariant(ev, 'the drop logged an event');
  expect(JSON.parse(ev.data)).toMatchObject({ text: 'Invented skills tidy-up', ref: 'widgets#3' });
});

test('the stats output heads the section on waits for the owner "Wait on the owner"', () => {
  const stats = computeStats(db, { from: '2026-10-16T01:00:00Z', to: '2026-10-16T01:10:00Z', gh: null });

  expect(statsText(stats)).toContain('Wait on the owner (z-stu acts: batch, reorder or chase what waits longest)');
});
