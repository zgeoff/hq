import { expect, onTestFinished, test } from 'bun:test';
import { at, fetchedDays, freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { addPr } from '../runs/add-pr.ts';
import { addRun } from '../runs/add-run.ts';
import { reviewedPr } from '../runs/reviewed-pr.ts';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { measure } from './measure.ts';
import { verdict } from './verdict.ts';

function setupTest() {
  const base = freshDb();
  const db = base.db;
  const savedCacheHome = process.env['XDG_CACHE_HOME'];
  onTestFinished(base.cleanup);
  onTestFinished(overrideEnv('HOME', base.dir));
  delete process.env['XDG_CACHE_HOME'];
  onTestFinished(() => {
    if (savedCacheHome === undefined) {
      delete process.env['XDG_CACHE_HOME'];
    } else {
      process.env['XDG_CACHE_HOME'] = savedCacheHome;
    }
  });
  at('2026-10-16T07:00:00.000Z');
  fetchedDays(db);
  const seedCIRun = (id: number, over: Partial<{ repo: string; path: string; status: string; conclusion: string | null; minutes: number }> = {}) => {
    const run = { repo: 'atc', path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success', minutes: 10, ...over };
    const start = '2026-10-16T02:00:00Z';
    db.query('INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)').run(id, run.repo, run.path, 'push', run.status, run.conclusion, start, start, new Date(Date.parse(start) + run.minutes * 60_000).toISOString().replace('.000', ''));
  };

  return {
    db,
    readMeasures: () => measure(db, new Date('2026-10-15T13:00:00Z'), new Date('2026-10-16T13:00:00Z'), new Date('2026-10-16T07:00:00Z')),
    seedPR: (number: number, issue: string | null, mergedAt = '2026-10-16T03:00:00Z') => db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', ?, ?, 'x: y', 'other', ?)`).run(number, mergedAt, issue),
    seedIssue: (id: string, type: string) => db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES (?, ?, 't', 'completed', NULL, '2026-10-16T00:00:00Z')`).run(id, type),
    seedCIRun,
    seedDeployRun: (id: number, outcome: string | null, over: Partial<{ conclusion: string | null; status: string }> = {}) => {
      seedCIRun(id, { repo: 'cloud', path: '.github/workflows/deploy-prod.yml', ...over });
      if (outcome) {
        db.query(`INSERT INTO deploy_runs (run_id, outcome, attempt, fetched_at) VALUES (?, ?, 1, '2026-10-16T05:00:00Z')`).run(id, outcome);
      }
    },
    seedOutage: (down: number, detectAfter = 1) => {
      const startMs = Date.parse('2026-10-16T01:00:00Z');
      const formatMinute = (min: number) => new Date(startMs + min * 60_000).toISOString().replace('.000', '');
      for (let minute = -10; minute < down + 10; minute++) {
        const isDown = minute >= 0 && minute < down;
        const targetOk = isDown ? 0 : 1;
        const controlOk = isDown ? 1 : null;
        db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, ?, ?)').run(formatMinute(minute), targetOk, controlOk);
      }
      db.query('INSERT INTO outages (started_at, detected_at, ended_at) VALUES (?, ?, ?)').run(formatMinute(0), formatMinute(detectAfter), formatMinute(down));
    },
    seedExactOutage: (downSec: number, detectSec: number) => {
      const startMs = Date.parse('2026-10-16T01:00:00Z');
      const formatSecond = (sec: number) => new Date(startMs + sec * 1000).toISOString().replace('.000', '');
      for (let second = -300; second <= downSec + 300; second += 30) {
        const isDown = second >= 0 && second < downSec;
        const targetOk = isDown ? 0 : 1;
        const controlOk = isDown ? 1 : null;
        db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, ?, ?)').run(formatSecond(second), targetOk, controlOk);
      }
      db.query('INSERT INTO outages (started_at, detected_at, ended_at) VALUES (?, ?, ?)').run(formatSecond(0), formatSecond(detectSec), formatSecond(downSec));
    },
  };
}

test('bugs and features share one denominator: merged PRs with a typed Linear issue', () => {
  const ctx = setupTest();
  ctx.seedIssue('GEO-1', 'Bug');
  ctx.seedIssue('GEO-2', 'Feature');
  ctx.seedIssue('GEO-3', 'Improvement');
  ctx.seedIssue('GEO-4', 'Chore');
  ctx.seedPR(1, 'GEO-1');
  ctx.seedPR(2, 'GEO-2');
  ctx.seedPR(3, 'GEO-3');
  ctx.seedPR(4, 'GEO-4');
  ctx.seedPR(5, null);
  ctx.seedPR(6, 'GEO-404');
  ctx.seedPR(7, 'GEO-1', '2026-10-10T03:00:00Z');
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
  for (const [offset, type] of ['Bug', 'Feature', 'Feature', 'Feature', 'Improvement'].entries()) {
    ctx.seedIssue(`GEO-${offset + 1}`, type);
  }
  for (let index = 1; index <= 5; index++) {
    ctx.seedPR(index, `GEO-${index}`);
  }
  const measures = ctx.readMeasures();
  expect(verdict(DEFAULT_TARGETS.bugs, measures.bugs)).toBe('red');
  expect(verdict(DEFAULT_TARGETS.features, measures.features)).toBe('green');
  expect(verdict({ op: '<=', value: 20 }, measures.bugs)).toBe('green');
});

test('deploy-prod rate counts applies only; holds and no-applies are shown apart', () => {
  const ctx = setupTest();
  let id = 100;
  for (let index = 0; index < 39; index++) {
    ctx.seedDeployRun(id++, 'applied_ok');
  }
  for (let index = 0; index < 20; index++) {
    ctx.seedDeployRun(id++, 'applied_failed', { conclusion: 'failure' });
  }
  for (let index = 0; index < 5; index++) {
    ctx.seedDeployRun(id++, 'cancelled', { conclusion: 'cancelled' });
  }
  for (let index = 0; index < 11; index++) {
    ctx.seedDeployRun(id++, 'held', { conclusion: 'failure' });
  }
  for (let index = 0; index < 6; index++) {
    ctx.seedDeployRun(id++, 'no_apply');
  }
  ctx.seedCIRun(1, { repo: 'cloud', path: '.github/workflows/ci.yml', conclusion: 'failure' });
  const result = ctx.readMeasures().deploys;
  expect(result).toMatchObject({ value: 61, denominator: 64, unit: 'applies', shown: '61%' });
  expect(result.detail).toBe('61% (39/64 applies), 11 held, 6 no-apply');
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('red');
});

test('deploy-prod rate: 9 of 10 applies with holds is 90%, and unclassified runs are named', () => {
  const ctx = setupTest();
  let id = 100;
  for (let index = 0; index < 9; index++) {
    ctx.seedDeployRun(id++, 'applied_ok');
  }
  ctx.seedDeployRun(id++, 'applied_failed', { conclusion: 'failure' });
  for (let index = 0; index < 11; index++) {
    ctx.seedDeployRun(id++, 'held', { conclusion: 'failure' });
  }
  expect(ctx.readMeasures().deploys.detail).toBe('90% (9/10 applies), 11 held');
  ctx.seedDeployRun(id++, null, { conclusion: 'success' });
  ctx.seedDeployRun(id++, null, { status: 'in_progress', conclusion: null });
  const result = ctx.readMeasures().deploys;
  expect(result).toMatchObject({ value: 90, denominator: 10 });
  expect(result.detail).toBe('90% (9/10 applies), 11 held, 1 not yet classified');
});

test('deploy-prod with a run not yet classified keeps its value but gets no colour', () => {
  const ctx = setupTest();
  for (let index = 0; index < 10; index++) {
    ctx.seedDeployRun(100 + index, 'applied_ok');
  }
  expect(verdict(DEFAULT_TARGETS.deploys, ctx.readMeasures().deploys)).toBe('green');
  ctx.seedDeployRun(200, null, { conclusion: 'success' });
  const result = ctx.readMeasures().deploys;
  expect(result).toMatchObject({ value: 100, unclassified: 1 });
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('none');
});

test('it names an unknown deploy outcome and withholds the colour while one remains', () => {
  const ctx = setupTest();
  for (let index = 0; index < 9; index++) {
    ctx.seedDeployRun(100 + index, 'applied_ok');
  }
  ctx.seedDeployRun(200, 'unknown', { conclusion: 'success' });

  const result = ctx.readMeasures().deploys;

  expect(result).toMatchObject({ value: 100, unknown: 1, detail: '100% (9/9 applies), 1 unknown outcome' });
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('none');
});

test('deploy-prod with no applies has no data, still naming holds', () => {
  const ctx = setupTest();
  ctx.seedDeployRun(1, 'held', { conclusion: 'failure' });
  ctx.seedDeployRun(2, 'no_apply');
  const result = ctx.readMeasures().deploys;
  expect(result).toMatchObject({ value: null, denominator: 0, shown: 'no data' });
  expect(result.detail).toBe('no data: no applies in the window, 1 held, 1 no-apply');
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('none');
});

test('ci waste is the minutes in failed or cancelled runs over all minutes', () => {
  const ctx = setupTest();
  ctx.seedCIRun(1, { minutes: 80 });
  ctx.seedCIRun(2, { minutes: 10, conclusion: 'failure' });
  ctx.seedCIRun(3, { minutes: 10, conclusion: 'cancelled' });
  ctx.seedCIRun(4, { minutes: 50, status: 'in_progress', conclusion: null });
  const result = ctx.readMeasures().ciwaste;
  expect(result).toMatchObject({ value: 20, denominator: 100 });
  expect(result.detail).toBe('20 of 100 CI minutes were in failed or cancelled runs');
  expect(verdict(DEFAULT_TARGETS.ciwaste, result)).toBe('red');
  expect(verdict({ op: '<=', value: 20 }, result)).toBe('green');
});

test('a past day not fetched leaves the measure incomplete, with no colour; today never counts', () => {
  const ctx = setupTest();
  ctx.seedCIRun(1, { minutes: 100 });
  expect(verdict(DEFAULT_TARGETS.ciwaste, ctx.readMeasures().ciwaste)).toBe('green');
  ctx.db.query(`DELETE FROM goal_days WHERE day = '2026-10-15'`).run();
  const result = ctx.readMeasures();
  expect(result.ciwaste).toMatchObject({ value: 0, missing: 1 });
  expect(result.ciwaste.detail).toContain('1 day(s) not fetched yet, so no colour');
  expect(verdict(DEFAULT_TARGETS.ciwaste, result.ciwaste)).toBe('none');
  expect(result.deploys.missing).toBe(1);
  ctx.db.query(`DELETE FROM merged_pr_days WHERE day = '2026-10-16'`).run();
  expect(ctx.readMeasures().bugs.missing).toBeUndefined();
  ctx.db.query(`DELETE FROM merged_pr_days WHERE day = '2026-10-15'`).run();
  ctx.seedIssue('GEO-1', 'Feature');
  ctx.seedPR(1, 'GEO-1');
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
  ctx.seedOutage(14);
  expect(verdict(DEFAULT_TARGETS.downtime, ctx.readMeasures().downtime)).toBe('green');
  expect(ctx.readMeasures().downtime).toMatchObject({ value: 14, shown: '14 min' });
});

test('downtime is red at 15 minutes', () => {
  const ctx = setupTest();
  ctx.seedOutage(15);
  expect(ctx.readMeasures().downtime.value).toBe(15);
  expect(verdict(DEFAULT_TARGETS.downtime, ctx.readMeasures().downtime)).toBe('red');
});

test('an outage caught after 6 minutes is red even when it was short', () => {
  const ctx = setupTest();
  ctx.seedOutage(8, 6);
  const result = ctx.readMeasures().downtime;
  expect(result.value).toBe(8);
  expect(result.longest).toBe(6);
  expect(verdict(DEFAULT_TARGETS.downtime, result)).toBe('red');
  expect(result.detail).toContain('slowest caught in 6 min');
});

test('samples and no outage: zero minutes, green', () => {
  const ctx = setupTest();
  ctx.db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, 1, NULL)').run('2026-10-16T02:00:00Z');
  expect(ctx.readMeasures().downtime).toMatchObject({ value: 0, denominator: 1 });
  expect(verdict(DEFAULT_TARGETS.downtime, ctx.readMeasures().downtime)).toBe('green');
});

test('a window the probe saw only blind has no data, never green', () => {
  const ctx = setupTest();
  for (const sampleAt of ['2026-10-16T02:00:00Z', '2026-10-16T02:01:00Z', '2026-10-16T02:02:00Z']) {
    ctx.db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, 0, 0)').run(sampleAt);
  }
  const result = ctx.readMeasures().downtime;
  expect(result).toMatchObject({ value: null, shown: 'no data', detail: 'no data: the probe saw the window only blind (the PC offline)' });
  expect(verdict(DEFAULT_TARGETS.downtime, result)).not.toBe('green');
});

test('cost reports the latest readings and the window peak', () => {
  const ctx = setupTest();
  for (const [t, five, seven] of [['2026-10-16T01:00:00Z', 10, 40], ['2026-10-16T03:00:00Z', 30, 71], ['2026-10-16T05:00:00Z', 20, 55]] as const) {
    ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run(t, 'active', five, seven);
  }
  ctx.seedCIRun(1, { minutes: 90 });
  const result = ctx.readMeasures().cost;
  expect(result).toMatchObject({ value: 71, denominator: 3 });
  expect(result.detail).toBe('Claude 7-day 55% and 5-hour 20% used at last reading (active account only), 7-day peak 71%; CI 90 min');
});

test('targets are judged on the unrounded share: 10 of 51 is under 20, 59.6% is under 60', () => {
  const ctx = setupTest();
  ctx.seedIssue('GEO-1', 'Bug');
  ctx.seedIssue('GEO-2', 'Feature');
  for (let index = 1; index <= 10; index++) {
    ctx.seedPR(index, 'GEO-1');
  }
  for (let index = 11; index <= 51; index++) {
    ctx.seedPR(index, 'GEO-2');
  }
  const result = ctx.readMeasures();
  expect(result.bugs).toMatchObject({ value: 20, shown: '20%' });
  expect(verdict(DEFAULT_TARGETS.bugs, result.bugs)).toBe('green');
  expect(verdict({ op: '>=', value: 80 }, result.features)).toBe('green');
  expect(verdict({ op: '>', value: 80.4 }, result.features)).toBe('red');
});

test('a 59.6% feature share does not pass the 60% target', () => {
  const ctx = setupTest();
  ctx.seedIssue('GEO-1', 'Feature');
  ctx.seedIssue('GEO-2', 'Bug');
  for (let index = 1; index <= 149; index++) {
    ctx.seedPR(index, 'GEO-1');
  }
  for (let index = 150; index <= 250; index++) {
    ctx.seedPR(index, 'GEO-2');
  }
  const result = ctx.readMeasures();
  expect(result.features).toMatchObject({ value: 60, shown: '60%' });
  expect(verdict(DEFAULT_TARGETS.features, result.features)).toBe('red');
});

test('ci waste is judged on raw durations: 100s ok plus 20s failed is 16.7%, not 0%', () => {
  const ctx = setupTest();
  ctx.seedCIRun(1, { minutes: 100 / 60 });
  ctx.seedCIRun(2, { conclusion: 'failure', minutes: 20 / 60 });
  const result = ctx.readMeasures().ciwaste;
  expect(result.exact).toBeCloseTo(16.67, 1);
  expect(verdict({ op: '<=', value: 10 }, result)).toBe('red');
});

test('untyped Linear issues (type none) stay out of the typed denominator', () => {
  const ctx = setupTest();
  ctx.seedIssue('GEO-1', 'none');
  ctx.seedPR(1, 'GEO-1');
  expect(ctx.readMeasures().bugs).toMatchObject({ value: null, denominator: 0 });
  ctx.seedIssue('GEO-2', 'Bug');
  ctx.seedIssue('GEO-3', 'Feature');
  ctx.seedPR(2, 'GEO-2');
  ctx.seedPR(3, 'GEO-3');
  expect(ctx.readMeasures().bugs).toMatchObject({ value: 50, denominator: 2 });
});

test('a usage reading stored at the report second counts', () => {
  const ctx = setupTest();
  ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run('2026-10-16T01:00:00Z', 'active', 10, 40);
  ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run('2026-10-16T07:00:00Z', 'active', 20, 90);
  expect(ctx.readMeasures().cost).toMatchObject({ value: 90, denominator: 2 });
});

test('cost targets compare the unrounded peak: 79.9 passes under 80', () => {
  const ctx = setupTest();
  ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run('2026-10-16T01:00:00Z', 'active', 10, 79.9);
  const result = ctx.readMeasures().cost;
  expect(result).toMatchObject({ value: 80, shown: '80%' });
  expect(verdict({ op: '<', value: 80 }, result)).toBe('green');
});

test('a detection of 5 min 1 s is red, though it shows as 5 min', () => {
  const ctx = setupTest();
  ctx.seedExactOutage(120, 301);
  const result = ctx.readMeasures().downtime;
  expect(result.longest).toBe(5);
  expect(result.longestExact).toBeCloseTo(301 / 60, 5);
  expect(verdict(DEFAULT_TARGETS.downtime, result)).toBe('red');
});

test('a detection of exactly 5 min is green', () => {
  const ctx = setupTest();
  ctx.seedExactOutage(120, 300);
  expect(verdict(DEFAULT_TARGETS.downtime, ctx.readMeasures().downtime)).toBe('green');
});

test('14 min 59 s down is green, though it shows as 15 min; 15 min 0 s is red', () => {
  const ctx = setupTest();
  ctx.seedExactOutage(14 * 60 + 59, 60);
  let result = ctx.readMeasures().downtime;
  expect(result.shown).toBe('15 min');
  expect(result.exact).toBeCloseTo(899 / 60, 5);
  expect(verdict(DEFAULT_TARGETS.downtime, result)).toBe('green');
  ctx.db.query('DELETE FROM probe_samples').run();
  ctx.db.query('DELETE FROM outages').run();
  ctx.seedExactOutage(15 * 60, 60);
  result = ctx.readMeasures().downtime;
  expect(result.shown).toBe('15 min');
  expect(verdict(DEFAULT_TARGETS.downtime, result)).toBe('red');
});
