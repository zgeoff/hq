import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { updateEnv } from '@zgeoff/testing/helpers';
import { iso } from '../clock/iso.ts';
import { addPr } from '../runs/add-pr.ts';
import { addRun } from '../runs/add-run.ts';
import { reviewedPr } from '../runs/reviewed-pr.ts';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { measure } from './measure.ts';
import { verdict } from './verdict.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

function setupTest() {
  const base = freshDb();
  const db = base.db;
  onTestFinished(base.cleanup);
  updateEnv('HOME', base.dir);
  updateEnv('XDG_CACHE_HOME', undefined);
  at('2026-10-16T07:00:00.000Z');

  return {
    db,
    seed: buildSeeder(base),
    readMeasures: () => measure(db, new Date('2026-10-15T13:00:00Z'), new Date('2026-10-16T13:00:00Z'), new Date('2026-10-16T07:00:00Z')),
  };
}

test('bugs and features share one denominator: merged PRs with a typed Linear issue', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  ctx.seed.linearIssue({ issue: 'GEO-1', type: 'Bug' });
  ctx.seed.linearIssue({ issue: 'GEO-2', type: 'Feature' });
  ctx.seed.linearIssue({ issue: 'GEO-3', type: 'Improvement' });
  ctx.seed.linearIssue({ issue: 'GEO-4', type: 'Chore' });
  ctx.seed.mergedPR({ number: 1, issue: 'GEO-1' });
  ctx.seed.mergedPR({ number: 2, issue: 'GEO-2' });
  ctx.seed.mergedPR({ number: 3, issue: 'GEO-3' });
  ctx.seed.mergedPR({ number: 4, issue: 'GEO-4' });
  ctx.seed.mergedPR({ number: 5, issue: null });
  ctx.seed.mergedPR({ number: 6, issue: 'GEO-404' });
  ctx.seed.mergedPR({ number: 7, issue: 'GEO-1', merged_at: '2026-10-10T03:00:00Z' });
  const result = ctx.readMeasures();
  expect(result.bugs).toMatchObject({ value: 25, denominator: 4, shown: '25%' });
  expect(result.bugs.detail).toBe('1 Bug of 4 merged PRs with a typed Linear issue');
  expect(result.features).toMatchObject({ value: 50, denominator: 4 });
  expect(verdict(DEFAULT_TARGETS.bugs, result.bugs)).toBe('red');
  expect(verdict(DEFAULT_TARGETS.features, result.features)).toBe('red');
});

test('a window with no typed PRs has no data, and no data is never green', () => {
  const ctx = setupTest();
  const result = ctx.readMeasures();
  for (const k of ['bugs', 'features', 'deploys', 'downtime', 'ciwaste', 'mustfix'] as const) {
    expect(result[k]).toMatchObject({ value: null, denominator: 0, shown: 'no data' });
    expect(result[k].detail).toContain('no data');
    expect(verdict(DEFAULT_TARGETS[k], result[k])).toBe('none');
  }
});

test('green at the edge of a target: bugs under 20, features at 60', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  for (const [offset, type] of (['Bug', 'Feature', 'Feature', 'Feature', 'Improvement'] as const).entries()) {
    ctx.seed.linearIssue({ issue: `GEO-${offset + 1}`, type });
  }
  for (let index = 1; index <= 5; index++) {
    ctx.seed.mergedPR({ number: index, issue: `GEO-${index}` });
  }
  const measures = ctx.readMeasures();
  expect(verdict(DEFAULT_TARGETS.bugs, measures.bugs)).toBe('red');
  expect(verdict(DEFAULT_TARGETS.features, measures.features)).toBe('green');
  expect(verdict({ op: '<=', value: 20 }, measures.bugs)).toBe('green');
});

test('deploy-prod rate counts applies only; holds and no-applies are shown apart', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  let id = 100;
  for (let index = 0; index < 39; index++) {
    ctx.seed.ciRun({ id, repo: 'cloud', path: '.github/workflows/deploy-prod.yml' });
    ctx.seed.deployRun({ run_id: id++, outcome: 'applied_ok' });
  }
  for (let index = 0; index < 20; index++) {
    ctx.seed.ciRun({ id, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'failure' });
    ctx.seed.deployRun({ run_id: id++, outcome: 'applied_failed' });
  }
  for (let index = 0; index < 5; index++) {
    ctx.seed.ciRun({ id, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'cancelled' });
    ctx.seed.deployRun({ run_id: id++, outcome: 'cancelled' });
  }
  for (let index = 0; index < 11; index++) {
    ctx.seed.ciRun({ id, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'failure' });
    ctx.seed.deployRun({ run_id: id++, outcome: 'held' });
  }
  for (let index = 0; index < 6; index++) {
    ctx.seed.ciRun({ id, repo: 'cloud', path: '.github/workflows/deploy-prod.yml' });
    ctx.seed.deployRun({ run_id: id++, outcome: 'no_apply' });
  }
  ctx.seed.ciRun({ id: 1, repo: 'cloud', path: '.github/workflows/ci.yml', conclusion: 'failure' });
  const result = ctx.readMeasures().deploys;
  expect(result).toMatchObject({ value: 61, denominator: 64, unit: 'applies', shown: '61%' });
  expect(result.detail).toBe('61% (39/64 applies), 11 held, 6 no-apply');
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('red');
});

test('deploy-prod rate: 9 of 10 applies with holds is 90%, and unclassified runs are named', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  let id = 100;
  for (let index = 0; index < 9; index++) {
    ctx.seed.ciRun({ id, repo: 'cloud', path: '.github/workflows/deploy-prod.yml' });
    ctx.seed.deployRun({ run_id: id++, outcome: 'applied_ok' });
  }
  ctx.seed.ciRun({ id, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'failure' });
  ctx.seed.deployRun({ run_id: id++, outcome: 'applied_failed' });
  for (let index = 0; index < 11; index++) {
    ctx.seed.ciRun({ id, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'failure' });
    ctx.seed.deployRun({ run_id: id++, outcome: 'held' });
  }
  expect(ctx.readMeasures().deploys.detail).toBe('90% (9/10 applies), 11 held');
  ctx.seed.ciRun({ id: id++, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'success' });
  ctx.seed.ciRun({ id: id++, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', status: 'in_progress', conclusion: null });
  const result = ctx.readMeasures().deploys;
  expect(result).toMatchObject({ value: 90, denominator: 10 });
  expect(result.detail).toBe('90% (9/10 applies), 11 held, 1 not yet classified');
});

test('deploy-prod with a run not yet classified keeps its value but gets no colour', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  for (let index = 0; index < 10; index++) {
    ctx.seed.ciRun({ id: 100 + index, repo: 'cloud', path: '.github/workflows/deploy-prod.yml' });
    ctx.seed.deployRun({ run_id: 100 + index, outcome: 'applied_ok' });
  }
  expect(verdict(DEFAULT_TARGETS.deploys, ctx.readMeasures().deploys)).toBe('green');
  ctx.seed.ciRun({ id: 200, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'success' });
  const result = ctx.readMeasures().deploys;
  expect(result).toMatchObject({ value: 100, unclassified: 1 });
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('none');
});

test('it names an unknown deploy outcome and withholds the colour while one remains', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  for (let index = 0; index < 9; index++) {
    ctx.seed.ciRun({ id: 100 + index, repo: 'cloud', path: '.github/workflows/deploy-prod.yml' });
    ctx.seed.deployRun({ run_id: 100 + index, outcome: 'applied_ok' });
  }
  ctx.seed.ciRun({ id: 200, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'success' });
  ctx.seed.deployRun({ run_id: 200, outcome: 'unknown' });

  const result = ctx.readMeasures().deploys;

  expect(result).toMatchObject({ value: 100, unknown: 1, detail: '100% (9/9 applies), 1 unknown outcome' });
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('none');
});

test('deploy-prod with no applies has no data, still naming holds', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  ctx.seed.ciRun({ id: 1, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', conclusion: 'failure' });
  ctx.seed.deployRun({ run_id: 1, outcome: 'held' });
  ctx.seed.ciRun({ id: 2, repo: 'cloud', path: '.github/workflows/deploy-prod.yml' });
  ctx.seed.deployRun({ run_id: 2, outcome: 'no_apply' });
  const result = ctx.readMeasures().deploys;
  expect(result).toMatchObject({ value: null, denominator: 0, shown: 'no data' });
  expect(result.detail).toBe('no data: no applies in the window, 1 held, 1 no-apply');
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('none');
});

test('ci waste is the minutes in failed or cancelled runs over all minutes', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  ctx.seed.ciRun({ id: 1, updated_at: '2026-10-16T03:20:00Z' });
  ctx.seed.ciRun({ id: 2, conclusion: 'failure' });
  ctx.seed.ciRun({ id: 3, conclusion: 'cancelled' });
  ctx.seed.ciRun({ id: 4, status: 'in_progress', conclusion: null, updated_at: '2026-10-16T02:50:00Z' });
  const result = ctx.readMeasures().ciwaste;
  expect(result).toMatchObject({ value: 20, denominator: 100 });
  expect(result.detail).toBe('20 of 100 CI minutes were in failed or cancelled runs');
  expect(verdict(DEFAULT_TARGETS.ciwaste, result)).toBe('red');
  expect(verdict({ op: '<=', value: 20 }, result)).toBe('green');
});

test('it colours the measure when every past day is fetched, though today is not', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays({ unfetchedPRDays: ['2026-10-16'] });
  ctx.seed.ciRun({ id: 1, updated_at: '2026-10-16T03:40:00Z' });
  expect(verdict(DEFAULT_TARGETS.ciwaste, ctx.readMeasures().ciwaste)).toBe('green');
});

test('a past day not fetched leaves the measure incomplete, with no colour; today never counts', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays({ unfetchedPRDays: ['2026-10-16'], unfetchedCIDays: ['2026-10-15'] });
  ctx.seed.ciRun({ id: 1, updated_at: '2026-10-16T03:40:00Z' });
  const result = ctx.readMeasures();
  expect(result.ciwaste).toMatchObject({ value: 0, missing: 1 });
  expect(result.ciwaste.detail).toContain('1 day(s) not fetched yet, so no colour');
  expect(verdict(DEFAULT_TARGETS.ciwaste, result.ciwaste)).toBe('none');
  expect(result.deploys.missing).toBe(1);
  expect(ctx.readMeasures().bugs.missing).toBeUndefined();
});

test('it leaves the features measure incomplete, with no colour, when a past day of merged PRs is not fetched', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays({ unfetchedPRDays: ['2026-10-15', '2026-10-16'] });
  ctx.seed.linearIssue({ issue: 'GEO-1', type: 'Feature' });
  ctx.seed.mergedPR({ number: 1, issue: 'GEO-1' });
  expect(ctx.readMeasures().features).toMatchObject({ value: 100, missing: 1 });
  expect(verdict(DEFAULT_TARGETS.features, ctx.readMeasures().features)).toBe('none');
});

test('must-fix is first reviews that needed a recheck, of the reviewed runs', () => {
  const ctx = setupTest();
  const run = (issueId: string, p: string, recheck: boolean) => {
    addRun(ctx.db, { issue: issueId, title: 'Invented', place: 'imp', session: null, next: 'x', gate: null, geoffChat: false, actor: 'z-delivery' });
    addPr(ctx.db, issueId, p, 'z-delivery');
    reviewedPr(ctx.db, p, 'abc1234', { recheck: false, force: false }, 'z-delivery');
    if (recheck) {
      reviewedPr(ctx.db, p, 'abc1234', { recheck: true, force: false }, 'z-delivery');
    }
  };
  at('2026-10-16T06:00:00Z');
  run('GEO-1', 'widgets#1', true);
  run('GEO-2', 'widgets#2', false);
  run('GEO-3', 'widgets#3', false);
  run('GEO-4', 'widgets#4', false);
  at('2026-10-16T07:00:00.000Z');
  const result = ctx.readMeasures().mustfix;
  expect(result).toMatchObject({ value: 25, denominator: 4 });
  expect(result.detail).toBe('1 of 4 reviewed runs had a must-fix at the first review');
  expect(verdict(DEFAULT_TARGETS.mustfix, result)).toBe('red');
});

test('downtime is green under 15 min and red at 15', () => {
  const ctx = setupTest();
  const startMs = Date.parse('2026-10-16T01:00:00Z');
  for (const minute of Array.from({ length: 10 }, (_, offset) => offset - 10)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  for (const minute of Array.from({ length: 14 }, (_, offset) => offset)) {
    ctx.seed.downProbeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  for (const minute of Array.from({ length: 10 }, (_, offset) => offset + 14)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  ctx.seed.closedOutage({ startedAt: '2026-10-16T01:00:00Z', detectedAt: '2026-10-16T01:01:00Z', endedAt: '2026-10-16T01:14:00Z' });
  expect(verdict(DEFAULT_TARGETS.downtime, ctx.readMeasures().downtime)).toBe('green');
  expect(ctx.readMeasures().downtime).toMatchObject({ value: 14, shown: '14 min' });
});

test('downtime is red at 15 minutes', () => {
  const ctx = setupTest();
  const startMs = Date.parse('2026-10-16T01:00:00Z');
  for (const minute of Array.from({ length: 10 }, (_, offset) => offset - 10)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  for (const minute of Array.from({ length: 15 }, (_, offset) => offset)) {
    ctx.seed.downProbeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  for (const minute of Array.from({ length: 10 }, (_, offset) => offset + 15)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  ctx.seed.closedOutage({ startedAt: '2026-10-16T01:00:00Z', detectedAt: '2026-10-16T01:01:00Z', endedAt: '2026-10-16T01:15:00Z' });
  expect(ctx.readMeasures().downtime.value).toBe(15);
  expect(verdict(DEFAULT_TARGETS.downtime, ctx.readMeasures().downtime)).toBe('red');
});

test('an outage caught after 6 minutes is red even when it was short', () => {
  const ctx = setupTest();
  const startMs = Date.parse('2026-10-16T01:00:00Z');
  for (const minute of Array.from({ length: 10 }, (_, offset) => offset - 10)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  for (const minute of Array.from({ length: 8 }, (_, offset) => offset)) {
    ctx.seed.downProbeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  for (const minute of Array.from({ length: 10 }, (_, offset) => offset + 8)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + minute * 60_000)) });
  }
  ctx.seed.closedOutage({ startedAt: '2026-10-16T01:00:00Z', detectedAt: '2026-10-16T01:06:00Z', endedAt: '2026-10-16T01:08:00Z' });
  const result = ctx.readMeasures().downtime;
  expect(result.value).toBe(8);
  expect(result.longest).toBe(6);
  expect(verdict(DEFAULT_TARGETS.downtime, result)).toBe('red');
  expect(result.detail).toContain('slowest caught in 6 min');
});

test('samples and no outage: zero minutes, green', () => {
  const ctx = setupTest();
  ctx.seed.probeSample({ at: '2026-10-16T02:00:00Z' });
  expect(ctx.readMeasures().downtime).toMatchObject({ value: 0, denominator: 1 });
  expect(verdict(DEFAULT_TARGETS.downtime, ctx.readMeasures().downtime)).toBe('green');
});

test('a window the probe saw only blind has no data, never green', () => {
  const ctx = setupTest();
  for (const sampleAt of ['2026-10-16T02:00:00Z', '2026-10-16T02:01:00Z', '2026-10-16T02:02:00Z']) {
    ctx.seed.blindProbeSample({ at: sampleAt });
  }
  const result = ctx.readMeasures().downtime;
  expect(result).toMatchObject({ value: null, shown: 'no data', detail: 'no data: the probe saw the window only blind (the PC offline)' });
  expect(verdict(DEFAULT_TARGETS.downtime, result)).not.toBe('green');
});

test('cost reports the latest readings and the window peak', () => {
  const ctx = setupTest();
  for (const [t, five, seven] of [['2026-10-16T01:00:00Z', 10, 40], ['2026-10-16T03:00:00Z', 30, 71], ['2026-10-16T05:00:00Z', 20, 55]] as const) {
    ctx.seed.usageSample({ at: t, account: 'active', five_hour: five, seven_day: seven });
  }
  ctx.seed.ciRun({ id: 1, updated_at: '2026-10-16T03:30:00Z' });
  const result = ctx.readMeasures().cost;
  expect(result).toMatchObject({ value: 71, denominator: 3 });
  expect(result.detail).toBe('Claude 7-day 55% and 5-hour 20% used at last reading (active account only), 7-day peak 71%; CI 90 min');
});

test('targets are judged on the unrounded share: 10 of 51 is under 20, 59.6% is under 60', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  ctx.seed.linearIssue({ issue: 'GEO-1', type: 'Bug' });
  ctx.seed.linearIssue({ issue: 'GEO-2', type: 'Feature' });
  for (let index = 1; index <= 10; index++) {
    ctx.seed.mergedPR({ number: index, issue: 'GEO-1' });
  }
  for (let index = 11; index <= 51; index++) {
    ctx.seed.mergedPR({ number: index, issue: 'GEO-2' });
  }
  const result = ctx.readMeasures();
  expect(result.bugs).toMatchObject({ value: 20, shown: '20%' });
  expect(verdict(DEFAULT_TARGETS.bugs, result.bugs)).toBe('green');
  expect(verdict({ op: '>=', value: 80 }, result.features)).toBe('green');
  expect(verdict({ op: '>', value: 80.4 }, result.features)).toBe('red');
});

test('a 59.6% feature share does not pass the 60% target', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  ctx.seed.linearIssue({ issue: 'GEO-1', type: 'Feature' });
  ctx.seed.linearIssue({ issue: 'GEO-2', type: 'Bug' });
  for (let index = 1; index <= 149; index++) {
    ctx.seed.mergedPR({ number: index, issue: 'GEO-1' });
  }
  for (let index = 150; index <= 250; index++) {
    ctx.seed.mergedPR({ number: index, issue: 'GEO-2' });
  }
  const result = ctx.readMeasures();
  expect(result.features).toMatchObject({ value: 60, shown: '60%' });
  expect(verdict(DEFAULT_TARGETS.features, result.features)).toBe('red');
});

test('ci waste is judged on raw durations: 100s ok plus 20s failed is 16.7%, not 0%', () => {
  const ctx = setupTest();
  ctx.seed.fetchedDays();
  ctx.seed.ciRun({ id: 1, updated_at: '2026-10-16T02:01:40Z' });
  ctx.seed.ciRun({ id: 2, conclusion: 'failure', updated_at: '2026-10-16T02:00:20Z' });
  const result = ctx.readMeasures().ciwaste;
  expect(result.exact).toBeCloseTo(16.67, 1);
  expect(verdict({ op: '<=', value: 10 }, result)).toBe('red');
});

test('untyped Linear issues (type none) stay out of the typed denominator', () => {
  const ctx = setupTest();
  ctx.seed.linearIssue({ issue: 'GEO-1', type: 'none' });
  ctx.seed.mergedPR({ number: 1, issue: 'GEO-1' });
  expect(ctx.readMeasures().bugs).toMatchObject({ value: null, denominator: 0 });
  ctx.seed.linearIssue({ issue: 'GEO-2', type: 'Bug' });
  ctx.seed.linearIssue({ issue: 'GEO-3', type: 'Feature' });
  ctx.seed.mergedPR({ number: 2, issue: 'GEO-2' });
  ctx.seed.mergedPR({ number: 3, issue: 'GEO-3' });
  expect(ctx.readMeasures().bugs).toMatchObject({ value: 50, denominator: 2 });
});

test('a usage reading stored at the report second counts', () => {
  const ctx = setupTest();
  ctx.seed.usageSample({ at: '2026-10-16T01:00:00Z', account: 'active', five_hour: 10, seven_day: 40 });
  ctx.seed.usageSample({ at: '2026-10-16T07:00:00Z', account: 'active', five_hour: 20, seven_day: 90 });
  expect(ctx.readMeasures().cost).toMatchObject({ value: 90, denominator: 2 });
});

test('cost targets compare the unrounded peak: 79.9 passes under 80', () => {
  const ctx = setupTest();
  ctx.seed.usageSample({ at: '2026-10-16T01:00:00Z', account: 'active', five_hour: 10, seven_day: 79.9 });
  const result = ctx.readMeasures().cost;
  expect(result).toMatchObject({ value: 80, shown: '80%' });
  expect(verdict({ op: '<', value: 80 }, result)).toBe('green');
});

test('a detection of 5 min 1 s is red, though it shows as 5 min', () => {
  const ctx = setupTest();
  const startMs = Date.parse('2026-10-16T01:00:00Z');
  for (const second of Array.from({ length: 10 }, (_, offset) => (offset - 10) * 30)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  for (const second of [0, 30, 60, 90]) {
    ctx.seed.downProbeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  for (const second of Array.from({ length: 11 }, (_, offset) => offset * 30 + 120)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  ctx.seed.closedOutage({ startedAt: '2026-10-16T01:00:00Z', detectedAt: '2026-10-16T01:05:01Z', endedAt: '2026-10-16T01:02:00Z' });
  const result = ctx.readMeasures().downtime;
  expect(result.longest).toBe(5);
  expect(result.longestExact).toBeCloseTo(301 / 60, 5);
  expect(verdict(DEFAULT_TARGETS.downtime, result)).toBe('red');
});

test('a detection of exactly 5 min is green', () => {
  const ctx = setupTest();
  const startMs = Date.parse('2026-10-16T01:00:00Z');
  for (const second of Array.from({ length: 10 }, (_, offset) => (offset - 10) * 30)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  for (const second of [0, 30, 60, 90]) {
    ctx.seed.downProbeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  for (const second of Array.from({ length: 11 }, (_, offset) => offset * 30 + 120)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  ctx.seed.closedOutage({ startedAt: '2026-10-16T01:00:00Z', detectedAt: '2026-10-16T01:05:00Z', endedAt: '2026-10-16T01:02:00Z' });
  expect(verdict(DEFAULT_TARGETS.downtime, ctx.readMeasures().downtime)).toBe('green');
});

test('it counts 14 min 59 s down as green, though it shows as 15 min', () => {
  const ctx = setupTest();
  const startMs = Date.parse('2026-10-16T01:00:00Z');
  for (const second of Array.from({ length: 10 }, (_, offset) => (offset - 10) * 30)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  for (const second of Array.from({ length: 30 }, (_, offset) => offset * 30)) {
    ctx.seed.downProbeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  for (const second of Array.from({ length: 10 }, (_, offset) => offset * 30 + 900)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  ctx.seed.closedOutage({ startedAt: '2026-10-16T01:00:00Z', detectedAt: '2026-10-16T01:01:00Z', endedAt: '2026-10-16T01:14:59Z' });
  const result = ctx.readMeasures().downtime;
  expect(result.shown).toBe('15 min');
  expect(result.exact).toBeCloseTo(899 / 60, 5);
  expect(verdict(DEFAULT_TARGETS.downtime, result)).toBe('green');
});

test('it counts 15 min 0 s down as red', () => {
  const ctx = setupTest();
  const startMs = Date.parse('2026-10-16T01:00:00Z');
  for (const second of Array.from({ length: 10 }, (_, offset) => (offset - 10) * 30)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  for (const second of Array.from({ length: 30 }, (_, offset) => offset * 30)) {
    ctx.seed.downProbeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  for (const second of Array.from({ length: 11 }, (_, offset) => offset * 30 + 900)) {
    ctx.seed.probeSample({ at: iso(new Date(startMs + second * 1000)) });
  }
  ctx.seed.closedOutage({ startedAt: '2026-10-16T01:00:00Z', detectedAt: '2026-10-16T01:01:00Z', endedAt: '2026-10-16T01:15:00Z' });
  const result = ctx.readMeasures().downtime;
  expect(result.shown).toBe('15 min');
  expect(verdict(DEFAULT_TARGETS.downtime, result)).toBe('red');
});
