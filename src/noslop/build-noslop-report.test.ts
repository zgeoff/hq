import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/open-db.ts';
import { buildNoslopReport } from './build-noslop-report.ts';
import { buildNoslopTotals } from './build-noslop-totals.ts';
import { recordRound } from './record-round.ts';
import type { RoundRow } from './record-round.ts';
import { renderNoslopReport } from './render-noslop-report.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-report-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  return {
    db,
    addRound: (round: Partial<RoundRow>) =>
      recordRound(db, {
        repo: 'widgets',
        pr: 7,
        kind: 'review',
        startedAt: '2026-10-18T01:00:00Z',
        endedAt: '2026-10-18T01:01:00Z',
        ms: 60_000,
        ok: true,
        head: null,
        base: null,
        depth: 'standard',
        findings: [],
        failedCalls: 0,
        conclusion: null,
        open: [],
        error: null,
        sha: 'abc1234',
        ...round,
      }),
  };
}

const FIND_A = { id: 'aaaaaaaaaaaaaaaa', lens: 'correctness', severity: 'high', title: 'Kettle never boils' },
  FIND_B = { id: 'bbbbbbbbbbbbbbbb', lens: 'style', severity: 'low', title: 'Lid is loose' },
  FIND_C = { id: 'cccccccccccccccc', lens: 'security', severity: 'high', title: 'Cord is bare' };

test('it reports no rounds as nothing to report', () => {
  const ctx = setupTest();

  expect(buildNoslopReport(ctx.db)).toStrictEqual([]);
  expect(renderNoslopReport([])).toBe('No noslop rounds.');
});

test('it adds two review rounds and a passing check into one PR report', () => {
  const ctx = setupTest();
  ctx.addRound({ findings: [FIND_A, FIND_B] });
  ctx.addRound({ startedAt: '2026-10-18T02:00:00Z', endedAt: '2026-10-18T02:02:00Z', ms: 120_000, findings: [FIND_B, FIND_C] });
  ctx.addRound({ kind: 'check', startedAt: '2026-10-18T02:10:00Z', endedAt: '2026-10-18T02:10:05Z', ms: 5000, conclusion: 'failure', open: [{ id: FIND_C.id, title: FIND_C.title, reason: 'no reply' }] });
  ctx.addRound({ kind: 'check', startedAt: '2026-10-18T03:00:00Z', endedAt: '2026-10-18T03:00:04Z', ms: 4000, conclusion: 'success' });

  expect(buildNoslopReport(ctx.db)).toStrictEqual([
    {
      ref: 'widgets#7',
      reviewsOk: 2,
      reviewsFailed: 0,
      fullReviews: 0,
      extraRounds: 1,
      confirmReviews: 0,
      findings: 3,
      bySeverity: { high: 2, low: 1 },
      latestCheck: 'success',
      answered: 3,
      openIDs: [],
      wallMs: 189_000,
      reviewToPassMs: 7_204_000,
      roundsWithNew: 2,
      repeatClass: 0,
      classUnknown: 1,
      late: { n: 0, of: 0 },
      lateUnknown: 1,
      mainMerge: 0,
      mergeUnknown: 3,
      baseMove: 0,
    },
  ]);
});

test('it counts the findings still open on the latest check as unanswered', () => {
  const ctx = setupTest();
  ctx.addRound({ findings: [FIND_A, FIND_B, FIND_C] });
  ctx.addRound({ kind: 'check', conclusion: 'failure', open: [{ id: FIND_A.id, title: FIND_A.title, reason: 'no reply' }, { id: FIND_C.id, title: FIND_C.title, reason: 'no reply' }] });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ latestCheck: 'failure', findings: 3, answered: 1, openIDs: [FIND_A.id, FIND_C.id], reviewToPassMs: null });
});

test('it counts a failed review apart and leaves its findings and its check out', () => {
  const ctx = setupTest();
  ctx.addRound({ findings: [FIND_A] });
  ctx.addRound({ ok: false, error: 'exit 1', findings: [FIND_B] });
  ctx.addRound({ kind: 'check', ok: false, error: 'exit 1' });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ reviewsOk: 1, reviewsFailed: 1, extraRounds: 0, findings: 1, latestCheck: null, answered: null, wallMs: 180_000 });
});

test('it reports each PR on its own', () => {
  const ctx = setupTest();
  ctx.addRound({ findings: [FIND_A] });
  ctx.addRound({ pr: 8, repo: 'gadgets', ok: false, error: 'timed out' });

  expect(buildNoslopReport(ctx.db).map((r) => r.ref)).toStrictEqual(['widgets#7', 'gadgets#8']);
});

test('it leaves out rounds that began before --since', () => {
  const ctx = setupTest();
  ctx.addRound({ startedAt: '2026-10-17T01:00:00Z', findings: [FIND_A] });
  ctx.addRound({ startedAt: '2026-10-18T01:00:00Z', findings: [FIND_B] });

  expect(buildNoslopReport(ctx.db, '2026-10-18T00:00:00Z')[0]).toMatchObject({ reviewsOk: 1, findings: 1, bySeverity: { low: 1 } });
});

test('it counts no new round when the only review since --since repeats a finding raised before it', () => {
  const ctx = setupTest();
  ctx.addRound({ startedAt: '2026-10-17T01:00:00Z', findings: [FIND_A] });
  ctx.addRound({ startedAt: '2026-10-18T01:00:00Z', findings: [FIND_A] });

  expect(buildNoslopReport(ctx.db, '2026-10-18T00:00:00Z')[0]).toMatchObject({ reviewsOk: 1, extraRounds: 0, findings: 1, roundsWithNew: 0, lateUnknown: 0, mergeUnknown: 0 });
});

test('it counts a late finding first raised since --since when an earlier review came before it', () => {
  const ctx = setupTest();
  ctx.addRound({ startedAt: '2026-10-17T01:00:00Z', findings: [FIND_A] });
  ctx.addRound({ startedAt: '2026-10-18T01:00:00Z', findings: [FIND_A, { ...FIND_B, late: true }] });

  expect(buildNoslopReport(ctx.db, '2026-10-18T00:00:00Z')[0]).toMatchObject({ reviewsOk: 1, roundsWithNew: 1, late: { n: 1, of: 1 }, lateUnknown: 0, mergeUnknown: 1 });
});

test('it counts a repeat-class when a finding since --since repeats the class of one raised before it', () => {
  const ctx = setupTest();
  ctx.addRound({ startedAt: '2026-10-17T01:00:00Z', findings: [{ ...FIND_A, criterion: 'taste-rule', rule: 'boil-check' }] });
  ctx.addRound({ startedAt: '2026-10-18T01:00:00Z', findings: [{ ...FIND_B, lens: 'correctness', criterion: 'taste-rule', rule: 'boil-check' }] });

  expect(buildNoslopReport(ctx.db, '2026-10-18T00:00:00Z')[0]).toMatchObject({ reviewsOk: 1, extraRounds: 0, findings: 1, roundsWithNew: 1, repeatClass: 1, classUnknown: 0 });
  // oxlint-disable-next-line id-length -- the late count is keyed n
  expect(buildNoslopTotals(buildNoslopReport(ctx.db, '2026-10-18T00:00:00Z'))).toStrictEqual({ prs: 1, roundsWithNew: 1, repeatClass: 1, classUnknown: 0, late: { n: 0, of: 0 }, lateUnknown: 1, mainMerge: 0, mergeUnknown: 1, baseMove: 0 });
});

test('it leaves out a PR whose rounds all began before --since', () => {
  const ctx = setupTest();
  ctx.addRound({ pr: 8, startedAt: '2026-10-17T01:00:00Z', findings: [FIND_A] });
  ctx.addRound({ startedAt: '2026-10-18T01:00:00Z', findings: [FIND_B] });

  expect(buildNoslopReport(ctx.db, '2026-10-18T00:00:00Z').map((r) => r.ref)).toStrictEqual(['widgets#7']);
});

test('it refuses a --since that is not a time', () => {
  const ctx = setupTest();

  expect(() => buildNoslopReport(ctx.db, 'yesterday-ish')).toThrow("--since must be an ISO time, got 'yesterday-ish'");
});

test('it counts the good reviews that ran with --full and prints them', () => {
  const ctx = setupTest();
  ctx.addRound({});
  ctx.addRound({ full: true, startedAt: '2026-10-18T02:00:00Z' });
  ctx.addRound({ full: true, ok: false, startedAt: '2026-10-18T03:00:00Z' });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ reviewsOk: 2, reviewsFailed: 1, fullReviews: 1 });
  expect(renderNoslopReport(buildNoslopReport(ctx.db))).toContain('  reviews: 2 ok, 1 failed (1 extra round, 1 full)');
});

test('it counts rounds with a new finding, repeat-class, late and main-merge findings', () => {
  const ctx = setupTest();
  ctx.addRound({ findings: [{ ...FIND_A, criterion: 'taste-rule', rule: 'boil-check', anchor: { path: 'src/kettle.ts', startLine: 1, endLine: 2 }, writtenByChange: true }] });
  ctx.addRound({ startedAt: '2026-10-18T02:00:00Z', findings: [{ ...FIND_A, criterion: 'taste-rule', rule: 'boil-check' }, { ...FIND_B, lens: 'correctness', criterion: 'taste-rule', rule: 'boil-check', late: true, writtenByChange: false }] });
  ctx.addRound({ startedAt: '2026-10-18T03:00:00Z', findings: [FIND_B, { ...FIND_C, criterion: 'cord-check', late: false, writtenByChange: true }] });
  ctx.addRound({ startedAt: '2026-10-18T04:00:00Z', findings: [FIND_C] });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ roundsWithNew: 3, repeatClass: 1, classUnknown: 0, late: { n: 1, of: 2 }, lateUnknown: 0, mainMerge: 1, mergeUnknown: 0 });
});

test('it leaves a finding of a failed review out of the churn', () => {
  const ctx = setupTest();
  ctx.addRound({ findings: [FIND_A] });
  ctx.addRound({ ok: false, error: 'exit 1', findings: [FIND_B] });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ roundsWithNew: 1, lateUnknown: 0 });
});

test('it counts rows stored before the new fields as unknown', () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, findings, sha) VALUES ('widgets', 7, 'review', '2026-10-18T01:00:00Z', 'b', 1, 1, ?, 'x')").run(JSON.stringify([FIND_A]));
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, findings, sha) VALUES ('widgets', 7, 'review', '2026-10-18T02:00:00Z', 'b', 1, 1, ?, 'x')").run(JSON.stringify([FIND_A, FIND_B]));

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ roundsWithNew: 2, repeatClass: 0, classUnknown: 1, late: { n: 0, of: 0 }, lateUnknown: 1, mainMerge: 0, mergeUnknown: 2 });
});

test('it prints the churn line and the totals block', () => {
  const ctx = setupTest();
  ctx.addRound({ findings: [{ ...FIND_A, criterion: 'taste-rule', rule: 'k' }] });
  ctx.addRound({ startedAt: '2026-10-18T02:00:00Z', findings: [{ ...FIND_B, lens: 'correctness', criterion: 'taste-rule', rule: 'k', late: true, writtenByChange: false }] });

  expect(renderNoslopReport(buildNoslopReport(ctx.db))).toContain('  churn: 2 rounds with a new finding, 1 repeat-class, late 1 of 1, 1 main-merge (1 unknown), 0 base-move');
  expect(renderNoslopReport(buildNoslopReport(ctx.db))).toContain('totals: 1 PR\n  churn:');
});

test('it counts --confirm reviews apart from the rounds, and the text names them', () => {
  const ctx = setupTest();
  ctx.addRound({});
  ctx.addRound({ startedAt: '2026-10-18T02:00:00Z' });
  ctx.addRound({ startedAt: '2026-10-18T03:00:00Z', confirm: true });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ reviewsOk: 3, extraRounds: 1, confirmReviews: 1 });
  expect(renderNoslopReport(buildNoslopReport(ctx.db))).toContain('  reviews: 3 ok, 0 failed (1 extra round, 1 --confirm)');
});

test('a base-move run hq recorded counts as a base move, not an extra round or a fix-checks-only run', () => {
  const ctx = setupTest();
  ctx.addRound({ head: 'a1a1a1a', patchId: 'kettle-diff' });
  ctx.addRound({ startedAt: '2026-10-18T02:00:00Z', head: 'b2b2b2b', patchId: 'kettle-diff', confirm: true, baseMove: true });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ reviewsOk: 2, extraRounds: 0, confirmReviews: 0, baseMove: 1 });
});

test('a round from before v45 at a new head with the PR diff of the review before it counts as a base move', () => {
  const ctx = setupTest();
  ctx.addRound({ head: 'a1a1a1a', patchId: 'kettle-diff' });
  ctx.addRound({ startedAt: '2026-10-18T02:00:00Z', head: 'b2b2b2b', patchId: 'kettle-diff' });
  ctx.addRound({ startedAt: '2026-10-18T03:00:00Z', head: 'c3c3c3c', patchId: 'kettle-diff-with-lid' });
  ctx.addRound({ startedAt: '2026-10-18T04:00:00Z', head: 'c3c3c3c', patchId: 'kettle-diff-with-lid' });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ reviewsOk: 4, extraRounds: 2, baseMove: 1 });
  expect(renderNoslopReport(buildNoslopReport(ctx.db))).toContain(', 0 main-merge, 1 base-move');
});

test('a --full review at a new head with the same PR diff is a round, not a base move', () => {
  const ctx = setupTest();
  ctx.addRound({ head: 'a1a1a1a', patchId: 'kettle-diff' });
  ctx.addRound({ startedAt: '2026-10-18T02:00:00Z', head: 'b2b2b2b', patchId: 'kettle-diff', full: true });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ extraRounds: 1, baseMove: 0 });
});

test('a round whose PR diff git could not read is never a base move', () => {
  const ctx = setupTest();
  ctx.addRound({ head: 'a1a1a1a', patchId: '' });
  ctx.addRound({ startedAt: '2026-10-18T02:00:00Z', head: 'b2b2b2b', patchId: '' });

  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ extraRounds: 1, baseMove: 0 });
});
