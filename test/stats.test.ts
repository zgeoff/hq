import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
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

let db: Database;
let cleanup: () => void;
const T0 = '2026-10-16T01:00:00Z'; // after the cutoff
const until = (m: number) => new Date(Date.parse(T0) + m * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'); // hq's own time format
const atMin = (m: number) => at(until(m));

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  atMin(0);
});
afterEach(() => cleanup());

const run = (issue: string, readySince: string | null = null) =>
  addRun(db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, readySince, actor: 'z-delivery' });

test('median and p90 by nearest rank; under 5 samples is thin', () => {
  expect(dist([30, 10, 20])).toEqual({ n: 3, medianMin: 20, p90Min: 30, thin: true });
  expect(dist([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toMatchObject({ medianMin: 5, p90Min: 9, thin: false });
  expect(dist([])).toEqual({ n: 0, medianMin: null, p90Min: null, thin: true });
});

test('wait on the owner: call queue → answer → apply, and run time waiting on the owner, exact or by the word', () => {
  addAsk(db, { kind: 'call', id: 'kettle-colour', title: 'Kettle colour', question: 'Red or blue?', body: 'Invented.', issues: [], forSession: null, actor: 'z-triage' });
  atMin(5);
  db.query("UPDATE asks SET state = 'open', opened_at = ? WHERE id = 'kettle-colour'").run(until(5));
  atMin(65);
  answerAsk(db, { id: 'kettle-colour', kind: 'call', answer: 'Blue.', actor: 'z-stu' });
  atMin(75);
  applyAsk(db, 'kettle-colour', 'call', 'linear:GEO-1', 'done', 'z-stu');

  run('GEO-1');
  setState(db, 'GEO-1', 'blocked', { waitsOn: "Geoff's yes" }, 'z-delivery'); // by the word, at 75
  atMin(135);
  setState(db, 'GEO-1', 'working', { waitsOn: null }, 'z-delivery'); // 60 min
  run('GEO-2');
  setState(db, 'GEO-2', 'blocked', { waitsOn: 'a release', waitsOnGeoff: true }, 'z-delivery'); // exact, at 135
  atMin(165);
  const s = computeStats(db, { from: T0, to: until(165), gh: null });
  expect(s.geoff.queueToAnswer).toMatchObject({ n: 1, medianMin: 65 });
  expect(s.geoff.answerToApply).toMatchObject({ n: 1, medianMin: 10 });
  expect(s.geoff.runGeoffWait.n).toBe(2);
  expect(s.geoff.oldestRunWait).toEqual({ id: 'GEO-2', ageMin: 30 });
  expect(s.geoff.runWaitExactShare).toBe(0.33); // 30 of 90 minutes set exactly
  expect(statsText(s)).toContain('67% matched by the word "Geoff" or "the owner"');
});

test('it counts a wait as exact only from when the explicit flag was set', () => {
  run('GEO-1');
  setState(db, 'GEO-1', 'blocked', { waitsOn: "Geoff's yes" }, 'z-delivery');
  atMin(10);
  setState(db, 'GEO-1', 'blocked', { waitsOn: "Geoff's yes", waitsOnGeoff: true }, 'z-delivery');
  atMin(20);
  setState(db, 'GEO-1', 'working', { waitsOn: null, waitsOnGeoff: false }, 'z-delivery');

  const stats = computeStats(db, { from: T0, to: until(30), gh: null });

  expect([stats.geoff.runGeoffWait.medianMin, stats.geoff.runWaitExactShare]).toStrictEqual([20, 0.5]);
});

test('a run blocked on "the owner" counts as waiting on the owner, as one blocked on "Geoff" does', () => {
  run('GEO-1');
  setState(db, 'GEO-1', 'blocked', { waitsOn: "the owner's yes" }, 'z-delivery');
  atMin(40);
  setState(db, 'GEO-1', 'working', { waitsOn: null }, 'z-delivery');
  run('GEO-2');
  setState(db, 'GEO-2', 'blocked', { waitsOn: 'the ownership papers' }, 'z-delivery');
  atMin(60);
  const stats = computeStats(db, { from: T0, to: until(60), gh: null });
  expect(stats.geoff.runGeoffWait.n).toBe(1);
  expect(stats.geoff.runGeoffWait.medianMin).toBe(40);
});

test('merged to live, the backlog by repo, review rework and cycle time', () => {
  run('GEO-1', '2026-10-15T23:00:00Z');
  addPr(db, 'GEO-1', 'widgets#1', 'z-delivery');
  reviewedPr(db, 'widgets#1', 'abc1234', { recheck: false, force: false }, 'z-delivery');
  reviewedPr(db, 'widgets#1', 'abc1234', { recheck: true, force: false }, 'z-delivery');
  atMin(30);
  closePr(db, 'widgets#1', { to: 'merged', actor: 'z-delivery' });
  setState(db, 'GEO-1', 'merged', {}, 'z-delivery');
  atMin(150);
  setState(db, 'GEO-1', 'done', {}, 'z-delivery');
  run('GEO-2');
  addPr(db, 'GEO-2', 'gadgets#2', 'z-delivery');
  reviewedPr(db, 'gadgets#2', 'def5678', { recheck: false, force: false }, 'z-delivery');
  closePr(db, 'gadgets#2', { to: 'merged', actor: 'z-delivery' });
  setState(db, 'GEO-2', 'deploy-held', {}, 'z-delivery');
  atMin(210);
  const s = computeStats(db, { from: T0, to: until(210), gh: null });
  expect(s.live.mergeToDone).toMatchObject({ n: 1, medianMin: 120 });
  expect(s.live.byRepo['widgets']).toMatchObject({ n: 1 });
  expect(s.live.backlog).toEqual({ total: 1, byRepo: { gadgets: 1 }, oldest: { id: 'GEO-2', ageMin: 60 } });
  expect(s.flow).toMatchObject({ reviewed: 2, rechecked: 1, reworkShare: 0.5, cycleFromReady: 1 });
  expect(s.flow.cycle.medianMin).toBe(270); // from 23:00Z Ready to 03:30Z done
  expect(s.flow.mergesSource).toBe('hq');
  expect(headline(s)).toContain('merge→live 2.0h (n=1), 1 waiting');
});

test('it times merged to live from when GitHub merged the PR, not from when hq saw it', () => {
  run('GEO-1');
  addPr(db, 'GEO-1', 'widgets#1', 'z-delivery');
  atMin(10);
  closePr(db, 'widgets#1', { to: 'merged', actor: 'github', facts: { mergedAt: until(0), mergeSha: null } });
  setState(db, 'GEO-1', 'merged', {}, 'z-delivery');
  atMin(20);
  setState(db, 'GEO-1', 'done', {}, 'z-delivery');

  const live = computeStats(db, { from: T0, to: until(30), gh: null }).live;
  expect(live.mergeToDone.n).toBe(1);
  expect(live.mergeToDone.medianMin).toBe(20);
});

test('idle capacity counts only while Ready work waited; a stale count is flagged; nudges convert', () => {
  const sample = (m: number, slots: number, eligible: number | null) => db.query('INSERT INTO lanes_samples (at, free_mib, slots, eligible) VALUES (?, 0, ?, ?)').run(until(m), slots, eligible);
  sample(0, 2, 3); // 2 slots × 10 min while ready
  sample(10, 2, 0); // nothing ready: not counted
  sample(20, 1, null); // unknown: 1 × 10
  sample(30, 0, 4);
  db.query("INSERT INTO lanes_nudges (at, slots, free_minutes, eligible, event_seq, slots_after) VALUES (?, 2, 10, 3, 1, 0), (?, 2, 10, 3, 1, 2), (?, 1, 10, null, 1, NULL)").run(until(1), until(11), until(21));
  const s = computeStats(db, { from: T0, to: until(40), gh: null });
  expect(s.idle).toEqual({ slotMinutesWhileReady: 20, slotMinutesUnknown: 10, staleShare: 0.25, samples: 4, nudges: 3, nudgesConverted: 1, nudgesPending: 1 });
  expect(statsText(s)).toContain('READY COUNT STALE in 25% of 4 samples: no fresh per-lane Ready report');
});

test('a merge that hq run unmerge took back is not counted', () => {
  run('GEO-1');
  addPr(db, 'GEO-1', 'widgets#5', 'z-delivery');
  addPr(db, 'GEO-1', 'gadgets#6', 'z-delivery');
  atMin(10);
  closePr(db, 'widgets#5', { to: 'merged', actor: 'z-review' });
  closePr(db, 'gadgets#6', { to: 'merged', actor: 'z-review' });
  atMin(20);
  unmergePr(db, 'widgets#5', 'z-review', 'the merge failed on a conflict');
  const s = computeStats(db, { from: T0, to: until(60), gh: null });
  expect(s.flow).toMatchObject({ mergesSource: 'hq', mergesPerDay: { gadgets: 1 } });
  expect(s.flow.mergesPerDay['widgets']).toBeUndefined();
});

test('GitHub merges per day by repo replace the tracked count when given', () => {
  const s = computeStats(db, { from: T0, to: until(2 * 1440), gh: [{ repo: 'widgets', mergedAt: until(5) }, { repo: 'widgets', mergedAt: until(1500) }, { repo: 'gadgets', mergedAt: until(10) }, { repo: 'gadgets', mergedAt: '2026-10-01T00:00:00Z' }] });
  expect(s.flow).toMatchObject({ mergesSource: 'github', days: 2, mergesPerDay: { widgets: 1, gadgets: 0.5 } });
});

test('rows from before the cutoff are left out', () => {
  at('2026-10-14T13:00:00Z');
  run('GEO-1');
  setState(db, 'GEO-1', 'blocked', { waitsOn: 'Geoff' }, 'z-delivery');
  atMin(60);
  const s = computeStats(db, { from: '2026-10-14T00:00:00Z', to: until(60), gh: null });
  expect(s.window.from).toBe('2026-10-14T20:00:00Z');
  expect(s.geoff.runGeoffWait.n).toBe(0);
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
  const ev = db.query("SELECT data FROM events WHERE action = 'mark-dropped'").get() as { data: string };
  expect(JSON.parse(ev.data)).toMatchObject({ text: 'Invented skills tidy-up', ref: 'widgets#3' });
});

test('the stats output heads the section on waits for the owner "Wait on the owner"', () => {
  const stats = computeStats(db, { from: T0, to: until(10), gh: null });

  expect(statsText(stats)).toContain('Wait on the owner (z-stu acts: batch, reorder or chase what waits longest)');
});
