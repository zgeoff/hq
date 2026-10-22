import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { at, fetchedDays, freshDb } from '../../test/helpers.ts';
import { addPr } from '../runs/add-pr.ts';
import { addRun } from '../runs/add-run.ts';
import { reviewedPr } from '../runs/reviewed-pr.ts';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { measure } from './measure.ts';
import { verdict } from './verdict.ts';

let cleanup: () => void, db: Database, dir: string;
const home = process.env['HOME'],
  xdg = process.env['XDG_CACHE_HOME'];

// The Sydney day of Fri 16 Oct 2026 (AEDT, UTC+11), judged at 18:00 Sydney.
const FROM = new Date('2026-10-15T13:00:00Z');
const TO = new Date('2026-10-16T13:00:00Z');
const NOW = new Date('2026-10-16T07:00:00Z');
const m = () => measure(db, FROM, TO, NOW);

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  process.env['HOME'] = dir;
  delete process.env['XDG_CACHE_HOME'];
  at(NOW.toISOString());
  fetchedDays(db);
});
afterEach(() => {
  process.env['HOME'] = home;
  if (xdg === undefined) {
    delete process.env['XDG_CACHE_HOME'];
  } else {
    process.env['XDG_CACHE_HOME'] = xdg;
  }
  cleanup();
});

const pr = (n: number, issue: string | null, mergedAt = '2026-10-16T03:00:00Z') => db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', ?, ?, 'x: y', 'other', ?)`).run(n, mergedAt, issue);
const issue = (id: string, type: string) => db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES (?, ?, 't', 'completed', NULL, '2026-10-16T00:00:00Z')`).run(id, type);
const ci = (id: number, over: Partial<{ repo: string; path: string; status: string; conclusion: string | null; minutes: number }> = {}) => {
  const o = { repo: 'atc', path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success', minutes: 10, ...over };
  const start = '2026-10-16T02:00:00Z';
  db.query('INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)').run(id, o.repo, o.path, 'push', o.status, o.conclusion, start, start, new Date(Date.parse(start) + o.minutes * 60_000).toISOString().replace('.000', ''));
};

test('bugs and features share one denominator: merged PRs with a typed Linear issue', () => {
  issue('GEO-1', 'Bug');
  issue('GEO-2', 'Feature');
  issue('GEO-3', 'Improvement');
  issue('GEO-4', 'Chore');
  pr(1, 'GEO-1');
  pr(2, 'GEO-2');
  pr(3, 'GEO-3');
  pr(4, 'GEO-4');
  pr(5, null); // no issue: not in the denominator
  pr(6, 'GEO-404'); // an issue hq has no type for: not in it either
  pr(7, 'GEO-1', '2026-10-10T03:00:00Z'); // outside the window
  const r = m();
  expect(r.bugs).toMatchObject({ value: 25, n: 4, shown: '25%' });
  expect(r.bugs.detail).toBe('1 Bug of 4 merged PRs with a typed Linear issue');
  expect(r.features).toMatchObject({ value: 50, n: 4 });
  expect(verdict(DEFAULT_TARGETS.bugs, r.bugs)).toBe('red'); // 25 is not under 20
  expect(verdict(DEFAULT_TARGETS.features, r.features)).toBe('red'); // 50 is under 60
});

test('a window with no typed PRs has no data, and no data is never green', () => {
  const r = m();
  for (const k of ['bugs', 'features', 'deploys', 'downtime', 'ciwaste', 'mustfix'] as const) {
    expect(r[k]).toMatchObject({ value: null, n: 0, shown: 'no data' });
    expect(r[k].detail).toContain('no data');
    expect(verdict(DEFAULT_TARGETS[k], r[k])).toBe('none');
  }
});

test('green at the edge of a target: bugs under 20, features at 60', () => {
  for (let i = 1; i <= 5; i++) issue(`GEO-${i}`, i === 1 ? 'Bug' : i <= 4 ? 'Feature' : 'Improvement');
  for (let i = 1; i <= 5; i++) pr(i, `GEO-${i}`);
  const r = m(); // 1 of 5 bugs = 20: not under 20; 4 of 5 = 80
  expect(verdict(DEFAULT_TARGETS.bugs, r.bugs)).toBe('red');
  expect(verdict(DEFAULT_TARGETS.features, r.features)).toBe('green');
  expect(verdict({ op: '<=', value: 20 }, r.bugs)).toBe('green');
});

const DEP = { repo: 'cloud', path: '.github/workflows/deploy-prod.yml' };
const deployRun = (id: number, outcome: string | null, over: Partial<{ conclusion: string | null; status: string }> = {}) => {
  ci(id, { ...DEP, ...over });
  if (outcome) db.query(`INSERT INTO deploy_runs (run_id, outcome, attempt, fetched_at) VALUES (?, ?, 1, '2026-10-16T05:00:00Z')`).run(id, outcome);
};

test('deploy-prod rate counts applies only; holds and no-applies are shown apart', () => {
  let id = 100;
  for (let i = 0; i < 39; i++) deployRun(id++, 'applied_ok');
  for (let i = 0; i < 20; i++) deployRun(id++, 'applied_failed', { conclusion: 'failure' });
  for (let i = 0; i < 5; i++) deployRun(id++, 'cancelled', { conclusion: 'cancelled' });
  for (let i = 0; i < 11; i++) deployRun(id++, 'held', { conclusion: 'failure' });
  for (let i = 0; i < 6; i++) deployRun(id++, 'no_apply');
  ci(1, { repo: 'cloud', path: '.github/workflows/ci.yml', conclusion: 'failure' }); // another workflow
  const r = m().deploys;
  expect(r).toMatchObject({ value: 61, n: 64, unit: 'applies', shown: '61%' });
  expect(r.detail).toBe('61% (39/64 applies), 11 held, 6 no-apply');
  expect(verdict(DEFAULT_TARGETS.deploys, r)).toBe('red');
});

test('deploy-prod rate: 9 of 10 applies with holds is 90%, and unclassified runs are named', () => {
  let id = 100;
  for (let i = 0; i < 9; i++) deployRun(id++, 'applied_ok');
  deployRun(id++, 'applied_failed', { conclusion: 'failure' });
  for (let i = 0; i < 11; i++) deployRun(id++, 'held', { conclusion: 'failure' });
  expect(m().deploys.detail).toBe('90% (9/10 applies), 11 held');
  deployRun(id++, null, { conclusion: 'success' }); // finished, not yet classified
  deployRun(id++, null, { status: 'in_progress', conclusion: null }); // running: not counted anywhere
  const r = m().deploys;
  expect(r).toMatchObject({ value: 90, n: 10 });
  expect(r.detail).toBe('90% (9/10 applies), 11 held, 1 not yet classified');
});

test('deploy-prod with a run not yet classified keeps its value but gets no colour', () => {
  for (let i = 0; i < 10; i++) deployRun(100 + i, 'applied_ok');
  expect(verdict(DEFAULT_TARGETS.deploys, m().deploys)).toBe('green');
  deployRun(200, null, { conclusion: 'success' });
  const r = m().deploys;
  expect(r).toMatchObject({ value: 100, unclassified: 1 });
  expect(verdict(DEFAULT_TARGETS.deploys, r)).toBe('none');
});

test('it names an unknown deploy outcome and withholds the colour while one remains', () => {
  for (let index = 0; index < 9; index++) {
    deployRun(100 + index, 'applied_ok');
  }
  deployRun(200, 'unknown', { conclusion: 'success' });

  const result = measure(db, FROM, TO, NOW).deploys;

  expect(result).toMatchObject({ value: 100, unknown: 1, detail: '100% (9/9 applies), 1 unknown outcome' });
  expect(verdict(DEFAULT_TARGETS.deploys, result)).toBe('none');
});

test('deploy-prod with no applies has no data, still naming holds', () => {
  deployRun(1, 'held', { conclusion: 'failure' });
  deployRun(2, 'no_apply');
  const r = m().deploys;
  expect(r).toMatchObject({ value: null, n: 0, shown: 'no data' });
  expect(r.detail).toBe('no data: no applies in the window, 1 held, 1 no-apply');
  expect(verdict(DEFAULT_TARGETS.deploys, r)).toBe('none');
});

test('ci waste is the minutes in failed or cancelled runs over all minutes', () => {
  ci(1, { minutes: 80 });
  ci(2, { minutes: 10, conclusion: 'failure' });
  ci(3, { minutes: 10, conclusion: 'cancelled' });
  ci(4, { minutes: 50, status: 'in_progress', conclusion: null }); // running: no minutes yet
  const r = m().ciwaste;
  expect(r).toMatchObject({ value: 20, n: 100 });
  expect(r.detail).toBe('20 of 100 CI minutes were in failed or cancelled runs');
  expect(verdict(DEFAULT_TARGETS.ciwaste, r)).toBe('red');
  expect(verdict({ op: '<=', value: 20 }, r)).toBe('green');
});

test('a past day not fetched leaves the measure incomplete, with no colour; today never counts', () => {
  ci(1, { minutes: 100 });
  expect(verdict(DEFAULT_TARGETS.ciwaste, m().ciwaste)).toBe('green'); // the window's past day and today are fetched
  db.query(`DELETE FROM goal_days WHERE day = '2026-10-15'`).run(); // the watcher missed the window's past UTC day
  const r = m();
  expect(r.ciwaste).toMatchObject({ value: 0, missing: 1 });
  expect(r.ciwaste.detail).toContain('1 day(s) not fetched yet, so no colour');
  expect(verdict(DEFAULT_TARGETS.ciwaste, r.ciwaste)).toBe('none');
  expect(r.deploys.missing).toBe(1);
  db.query(`DELETE FROM merged_pr_days WHERE day = '2026-10-16'`).run(); // today: still open, not counted
  expect(m().bugs.missing).toBeUndefined();
  db.query(`DELETE FROM merged_pr_days WHERE day = '2026-10-15'`).run();
  issue('GEO-1', 'Feature');
  pr(1, 'GEO-1');
  expect(m().features).toMatchObject({ value: 100, missing: 1 });
  expect(verdict(DEFAULT_TARGETS.features, m().features)).toBe('none');
});

test('must-fix is first reviews that needed a recheck, of the reviewed runs', () => {
  const run = (issueId: string, p: string, recheck: boolean) => {
    addRun(db, { issue: issueId, title: 'Invented', place: 'imp', session: null, next: 'x', gate: null, geoffChat: false, actor: 'z-delivery' });
    addPr(db, issueId, p, 'z-delivery');
    reviewedPr(db, p, 'abc1234', { recheck: false, force: false }, 'z-delivery');
    if (recheck) reviewedPr(db, p, 'abc1234', { recheck: true, force: false }, 'z-delivery');
  };
  at('2026-10-16T06:00:00Z'); // the reviews fall before the window's end
  run('GEO-1', 'widgets#1', true);
  run('GEO-2', 'widgets#2', false);
  run('GEO-3', 'widgets#3', false);
  run('GEO-4', 'widgets#4', false);
  at(NOW.toISOString());
  const r = m().mustfix;
  expect(r).toMatchObject({ value: 25, n: 4 });
  expect(r.detail).toBe('1 of 4 reviewed runs had a must-fix at the first review');
  expect(verdict(DEFAULT_TARGETS.mustfix, r)).toBe('red');
});

// Nix downtime: a probe sample a minute, down from 12:00 for `down` minutes (all in the window).
function outage(down: number, detectAfter = 1) {
  const t0 = Date.parse('2026-10-16T01:00:00Z');
  const z = (min: number) => new Date(t0 + min * 60_000).toISOString().replace('.000', '');
  for (let i = -10; i < down + 10; i++) {
    const isDown = i >= 0 && i < down;
    db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, ?, ?)').run(z(i), isDown ? 0 : 1, isDown ? 1 : null);
  }
  db.query('INSERT INTO outages (started_at, detected_at, ended_at) VALUES (?, ?, ?)').run(z(0), z(detectAfter), z(down));
}

test('downtime is green under 15 min and red at 15', () => {
  outage(14);
  expect(verdict(DEFAULT_TARGETS.downtime, m().downtime)).toBe('green');
  expect(m().downtime).toMatchObject({ value: 14, shown: '14 min' });
});

test('downtime is red at 15 minutes', () => {
  outage(15);
  expect(m().downtime.value).toBe(15);
  expect(verdict(DEFAULT_TARGETS.downtime, m().downtime)).toBe('red');
});

test('an outage caught after 6 minutes is red even when it was short', () => {
  outage(8, 6);
  const r = m().downtime;
  expect(r.value).toBe(8);
  expect(r.longest).toBe(6);
  expect(verdict(DEFAULT_TARGETS.downtime, r)).toBe('red');
  expect(r.detail).toContain('slowest caught in 6 min');
});

test('samples and no outage: zero minutes, green', () => {
  db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, 1, NULL)').run('2026-10-16T02:00:00Z');
  expect(m().downtime).toMatchObject({ value: 0, n: 1 });
  expect(verdict(DEFAULT_TARGETS.downtime, m().downtime)).toBe('green');
});

test('a window the probe saw only blind has no data, never green', () => {
  for (const t of ['2026-10-16T02:00:00Z', '2026-10-16T02:01:00Z', '2026-10-16T02:02:00Z']) db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, 0, 0)').run(t);
  const r = m().downtime;
  expect(r).toMatchObject({ value: null, shown: 'no data', detail: 'no data: the probe saw the window only blind (the PC offline)' });
  expect(verdict(DEFAULT_TARGETS.downtime, r)).not.toBe('green');
});

test('cost reports the latest readings and the window peak', () => {
  for (const [t, five, seven] of [['2026-10-16T01:00:00Z', 10, 40], ['2026-10-16T03:00:00Z', 30, 71], ['2026-10-16T05:00:00Z', 20, 55]] as const) {
    db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run(t, 'active', five, seven);
  }
  ci(1, { minutes: 90 });
  const r = m().cost;
  expect(r).toMatchObject({ value: 71, n: 3 });
  expect(r.detail).toBe('Claude 7-day 55% and 5-hour 20% used at last reading (active account only), 7-day peak 71%; CI 90 min');
});

test('targets are judged on the unrounded share: 10 of 51 is under 20, 59.6% is under 60', () => {
  issue('GEO-1', 'Bug');
  issue('GEO-2', 'Feature');
  for (let i = 1; i <= 10; i++) pr(i, 'GEO-1');
  for (let i = 11; i <= 51; i++) pr(i, 'GEO-2');
  const r = m();
  expect(r.bugs).toMatchObject({ value: 20, shown: '20%' }); // 19.61% shows as 20%
  expect(verdict(DEFAULT_TARGETS.bugs, r.bugs)).toBe('green');
  expect(verdict({ op: '>=', value: 80 }, r.features)).toBe('green'); // 80.39% shows as 80%
  expect(verdict({ op: '>', value: 80.4 }, r.features)).toBe('red');
});

test('a 59.6% feature share does not pass the 60% target', () => {
  issue('GEO-1', 'Feature');
  issue('GEO-2', 'Bug');
  for (let i = 1; i <= 149; i++) pr(i, 'GEO-1');
  for (let i = 150; i <= 250; i++) pr(i, 'GEO-2');
  const r = m();
  expect(r.features).toMatchObject({ value: 60, shown: '60%' }); // 59.6% shows as 60%
  expect(verdict(DEFAULT_TARGETS.features, r.features)).toBe('red');
});

test('ci waste is judged on raw durations: 100s ok plus 20s failed is 16.7%, not 0%', () => {
  ci(1, { minutes: 100 / 60 });
  ci(2, { conclusion: 'failure', minutes: 20 / 60 });
  const r = m().ciwaste;
  expect(r.exact).toBeCloseTo(16.67, 1);
  expect(verdict({ op: '<=', value: 10 }, r)).toBe('red');
});

test('untyped Linear issues (type none) stay out of the typed denominator', () => {
  issue('GEO-1', 'none');
  pr(1, 'GEO-1');
  expect(m().bugs).toMatchObject({ value: null, n: 0 });
  issue('GEO-2', 'Bug');
  issue('GEO-3', 'Feature');
  pr(2, 'GEO-2');
  pr(3, 'GEO-3');
  expect(m().bugs).toMatchObject({ value: 50, n: 2 });
});

test('a usage reading stored at the report second counts', () => {
  db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run('2026-10-16T01:00:00Z', 'active', 10, 40);
  db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run('2026-10-16T07:00:00Z', 'active', 20, 90);
  expect(m().cost).toMatchObject({ value: 90, n: 2 });
});

test('cost targets compare the unrounded peak: 79.9 passes under 80', () => {
  db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run('2026-10-16T01:00:00Z', 'active', 10, 79.9);
  const r = m().cost;
  expect(r).toMatchObject({ value: 80, shown: '80%' });
  expect(verdict({ op: '<', value: 80 }, r)).toBe('green');
});

// A sample every 30 s around an outage that starts at 12:00 Sydney and lasts `downSec`, caught `detectSec` in.
function exactOutage(downSec: number, detectSec: number) {
  const t0 = Date.parse('2026-10-16T01:00:00Z');
  const z = (sec: number) => new Date(t0 + sec * 1000).toISOString().replace('.000', '');
  for (let s = -300; s <= downSec + 300; s += 30) {
    const isDown = s >= 0 && s < downSec;
    db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, ?, ?)').run(z(s), isDown ? 0 : 1, isDown ? 1 : null);
  }
  db.query('INSERT INTO outages (started_at, detected_at, ended_at) VALUES (?, ?, ?)').run(z(0), z(detectSec), z(downSec));
}

test('a detection of 5 min 1 s is red, though it shows as 5 min', () => {
  exactOutage(120, 301);
  const r = m().downtime;
  expect(r.longest).toBe(5);
  expect(r.longestExact).toBeCloseTo(301 / 60, 5);
  expect(verdict(DEFAULT_TARGETS.downtime, r)).toBe('red');
});

test('a detection of exactly 5 min is green', () => {
  exactOutage(120, 300);
  expect(verdict(DEFAULT_TARGETS.downtime, m().downtime)).toBe('green');
});

test('14 min 59 s down is green, though it shows as 15 min; 15 min 0 s is red', () => {
  exactOutage(14 * 60 + 59, 60);
  let r = m().downtime;
  expect(r.shown).toBe('15 min');
  expect(r.exact).toBeCloseTo(899 / 60, 5);
  expect(verdict(DEFAULT_TARGETS.downtime, r)).toBe('green');
  db.query('DELETE FROM probe_samples').run();
  db.query('DELETE FROM outages').run();
  exactOutage(15 * 60, 60);
  r = m().downtime;
  expect(r.shown).toBe('15 min');
  expect(verdict(DEFAULT_TARGETS.downtime, r)).toBe('red');
});
