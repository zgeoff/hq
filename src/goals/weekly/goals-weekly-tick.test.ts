import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { iso } from '../../clock/iso.ts';
import { setMeta } from '../../db/set-meta.ts';
import { goalsWeeklyCheck } from './goals-weekly-check.ts';
import { goalsWeeklyTick } from './goals-weekly-tick.ts';
import { sendWeekly } from './send-weekly.ts';
import { skipWeekly } from './skip-weekly.ts';
import { weeklyText } from './weekly-text.ts';
import { sydneyUtc } from '../../morning/sydney-utc.ts';
import { owner } from '../../owner.ts';
import { setForward } from '../../outbox/set-forward.ts';
import { addNews } from '../../news/add-news.ts';
import { setAccountLabel } from '../../accounts/set-account-label.ts';
import type { Runner } from '../../runner/types.ts';
import { refreshActionsSpend } from '../refresh-actions-spend.ts';
import { at, fetchedDays, freshDb } from '../../../test/helpers.ts';

let db: Database;
let dir: string;
let cleanup: () => void;
const home = process.env['HOME'];
const syd = (date: string, hm: string) => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return sydneyUtc(y!, mo!, d!, h!, mi!);
};
const outbox = () => db.query('SELECT target, text, status, topic FROM outbox').all() as { target: string; text: string; status: string; topic: string }[];
const synced = (when: Date) => {
  for (const k of ['goals_ok_at', 'kinds_ok_at', 'linear_synced_at']) setMeta(db, k, iso(when));
};
// Monday 19 Oct 2026 is the first run: it reviews 12-18 Oct, against 5-11 Oct.
const MON = '2026-10-19';
const tick = (date: string, hm: string) => goalsWeeklyTick(db, 'hq-lanes', syd(date, hm));
const issue = (id: string, type: string) => db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES (?, ?, 't', 'completed', NULL, '2026-10-16T00:00:00Z')`).run(id, type);
const pr = (n: number, issueId: string, mergedAt: string) => db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', ?, ?, 'x: y', 'other', ?)`).run(n, mergedAt, issueId);
const usage = (t: string, account: string, five: number, seven: number | null) => db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run(t, account, five, seven);
const row = (text: string, name: string) => text.split('\n').find((l) => l.startsWith(`| ${name}`))!;

function makeActionsGh(netAmount: number): Runner {
  return () => Promise.resolve({ code: 0, stdout: JSON.stringify({ usageItems: [{ product: 'actions', netAmount }] }), stderr: '' });
}

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  process.env['HOME'] = dir;
  at('2026-10-19T05:00:00Z');
  fetchedDays(db);
});
afterEach(() => {
  process.env['HOME'] = home;
  cleanup();
});

test('nothing before Monday 17:00, and nothing on another day', () => {
  synced(syd(MON, '16:40'));
  expect(tick(MON, '16:59')).toEqual({ run: null, waiting: null });
  synced(syd('2026-10-20', '17:40'));
  expect(tick('2026-10-20', '17:05')).toEqual({ run: null, waiting: null });
  expect(tick('2026-10-18', '17:05')).toEqual({ run: null, waiting: null });
  expect(outbox()).toEqual([]);
});

test('at Monday 17:00 one message goes to z-stu with the table, both weeks and the flags; a second tick sends nothing', () => {
  issue('GEO-1', 'Bug');
  issue('GEO-2', 'Feature');
  pr(1, 'GEO-1', '2026-10-14T03:00:00Z'); // this week: 1 Bug of 2
  pr(2, 'GEO-2', '2026-10-15T03:00:00Z');
  pr(3, 'GEO-2', '2026-10-08T03:00:00Z'); // the week before: 0 Bug of 1
  pr(4, 'GEO-2', '2026-10-19T03:00:00Z'); // this Monday: in neither week
  synced(syd(MON, '16:50'));
  const r = tick(MON, '17:01');
  expect(r.run).toMatchObject({ job: 'goals-weekly', key: MON, result: 'queued', detail: null });
  expect(outbox()).toHaveLength(1);
  const [msg] = outbox();
  expect(msg).toMatchObject({ target: 'z-stu', status: 'pending', topic: 'job:goals-weekly:2026-10-19' });
  const lines = msg!.text.split('\n');
  expect(lines[0]).toBe('Goals weekly, week of 12 Oct:');
  expect(lines).toContain('| goal | target | this week | last week | |');
  expect(row(msg!.text, 'Bug share')).toBe('| Bug share | <20% by 2 Nov | 50% of 2 typed PRs | 0% of 1 typed PRs | 🔴 red |');
  expect(row(msg!.text, 'Feature + Improvement share')).toBe('| Feature + Improvement share | >=60% | 50% of 2 typed PRs | 100% of 1 typed PRs | 🔴 red |');
  expect(row(msg!.text, 'deploy-prod success')).toContain('| >=90% | no data (0 applies) | no data (0 applies) | – |');
  expect(lines.filter((l) => l.startsWith('| ')).length).toBe(2 + 7); // header, rule, 7 goals
  expect(lines).toContain('Flags you kept:');
  expect(lines.at(-1)).toBe('Targets live in hq config: hq goals targets; move one with hq goals target <key> <op> <value>.');
  expect(tick(MON, '17:06')).toEqual({ run: null, waiting: null });
  expect(tick(MON, '23:59')).toEqual({ run: null, waiting: null });
  expect(outbox()).toHaveLength(1);
});

test('a green row says so, and the colour follows the unrounded share', () => {
  issue('GEO-1', 'Feature');
  pr(1, 'GEO-1', '2026-10-14T03:00:00Z');
  const text = weeklyText(db, syd(MON, '17:00'));
  expect(row(text, 'Feature + Improvement share')).toContain('100% of 1 typed PRs | no data (0 typed PRs) | 🟢 green |');
});

test('a week with days not fetched says so and gets no colour', () => {
  issue('GEO-1', 'Feature');
  pr(1, 'GEO-1', '2026-10-14T03:00:00Z');
  db.query(`DELETE FROM merged_pr_days WHERE day IN ('2026-10-12', '2026-10-13')`).run();
  const text = weeklyText(db, syd(MON, '17:00'));
  expect(row(text, 'Feature + Improvement share')).toContain('100% of 1 typed PRs, 2 day(s) not fetched | no data (0 typed PRs) | – |');
  db.query(`DELETE FROM goal_days WHERE day = '2026-10-08'`).run(); // last week: no CI runs stored, and a day not fetched
  expect(row(weeklyText(db, syd(MON, '17:00')), 'CI minutes wasted')).toContain('| no data (0 CI min, 1 day(s) not fetched) |');
});

test('the downtime row gives outages, the slowest detection and blind minutes, judged on exact durations', () => {
  const t0 = Date.parse('2026-10-14T01:00:00Z');
  const z = (ms: number) => iso(new Date(t0 + ms));
  for (let i = -20; i < 40; i++) db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, ?, ?)').run(z(i * 60_000), i >= 0 && i < 4 ? 0 : 1, i >= 0 && i < 4 ? 1 : null);
  db.query('INSERT INTO outages (started_at, detected_at, ended_at) VALUES (?, ?, ?)').run(z(0), z(2 * 60_000), z(4 * 60_000));
  const text = weeklyText(db, syd(MON, '17:00'));
  expect(row(text, 'Nix downtime')).toMatch(/^\| Nix downtime \| <15 min a week, each outage caught within 5 min \| 4 min down, 1 outage\(s\), slowest caught in 2 min, [\d.]+ min blind \(\d+ samples\) \| no data \(0 samples\) \| 🟢 green \|$/);
});

test('the cost row names an account by its label when set, else by the short key, with CI minutes and no colour', () => {
  usage('2026-10-13T01:00:00Z', 'abcdef012345', 10, 40);
  usage('2026-10-14T01:00:00Z', 'abcdef012345', 20, 71);
  usage('2026-10-15T01:00:00Z', 'abcdef012345', 30, 55);
  usage('2026-10-15T02:00:00Z', '0123456789ab', 5, 12);
  usage('2026-10-07T01:00:00Z', 'abcdef012345', 1, 33); // the week before
  db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (1, 'atc', 'ci.yml', 'push', 'completed', 'success', 1, '2026-10-14T02:00:00Z', '2026-10-14T02:00:00Z', '2026-10-14T03:30:00Z')`).run();
  let cost = row(weeklyText(db, syd(MON, '17:00')), 'Cost');
  expect(cost).toContain('012345: 7-day peak 12%, latest 5-hour 5% and 7-day 12% (1 readings)');
  expect(cost).toContain('abcdef: 7-day peak 71%, latest 5-hour 30% and 7-day 55% (3 readings); CI 90 min');
  expect(cost).toContain('abcdef: 7-day peak 33%, latest 5-hour 1% and 7-day 33% (1 readings); CI 0 min'); // last week
  expect(cost.endsWith('| – |')).toBe(true);
  expect(cost).toContain('| <=$50 a month on Actions | Actions spend unknown; ');
  setAccountLabel(db, 'abcdef012345', 'work', 'z-stu');
  cost = row(weeklyText(db, syd(MON, '17:00')), 'Cost');
  expect(cost).toContain('work: 7-day peak 71%');
  expect(cost).not.toContain('abcdef:');
  expect(cost).toContain('012345: 7-day peak 12%');
});

test('the cost colour is green with the Actions spend under the pro-rated budget, whatever the Claude peaks', async () => {
  usage('2026-10-13T01:00:00Z', 'aaaaaaaaaaaa', 10, 95);
  await refreshActionsSpend(db, makeActionsGh(30.64), syd(MON, '16:45'));

  const cost = row(weeklyText(db, syd(MON, '17:00')), 'Cost');

  expect(cost).toContain('| Actions $30.64 of $30.65 budget to date; aaaaaa: 7-day peak 95%');
  expect(cost).toEndWith('| 🟢 green |');
});

test('the cost colour is red with the Actions spend over the pro-rated budget', async () => {
  usage('2026-10-13T01:00:00Z', 'aaaaaaaaaaaa', 10, 20);
  await refreshActionsSpend(db, makeActionsGh(30.66), syd(MON, '16:45'));

  const cost = row(weeklyText(db, syd(MON, '17:00')), 'Cost');

  expect(cost).toContain('| Actions $30.66 of $30.65 budget to date; aaaaaa: 7-day peak 20%');
  expect(cost).toEndWith('| 🔴 red |');
});

test('the cost row shows the Actions spend as unknown, with no colour, when gh fails', async () => {
  await refreshActionsSpend(db, () => Promise.resolve({ code: 1, stdout: '', stderr: 'HTTP 403' }), syd(MON, '16:45'));

  const cost = row(weeklyText(db, syd(MON, '17:00')), 'Cost');

  expect(cost).toContain('| Actions spend unknown; ');
  expect(cost).toEndWith('| – |');
});

test('legacy active readings stay in a mixed week beside the keyed ones', () => {
  usage('2026-10-13T01:00:00Z', 'active', 10, 95);
  usage('2026-10-15T01:00:00Z', 'bbbbbbbbbbbb', 5, 20);
  const cost = row(weeklyText(db, syd(MON, '17:00')), 'Cost');
  expect(cost).toContain('active: 7-day peak 95%');
  expect(cost).toContain('bbbbbb: 7-day peak 20%');
});

test('the cost row says active account only when a week has no per-account rows', () => {
  expect(row(weeklyText(db, syd(MON, '17:00')), 'Cost')).toContain('active account only: no readings');
  usage('2026-10-14T01:00:00Z', 'active', 20, 60);
  const cost = row(weeklyText(db, syd(MON, '17:00')), 'Cost');
  expect(cost).toContain('active account only: 7-day peak 60%, latest 5-hour 20% and 7-day 60% (1 readings)');
  expect(cost).toContain('active account only: no readings'); // last week
});

test('flags are the weekly-flag items since the last weekly, filtered by tag and by time', () => {
  at('2026-10-10T01:00:00Z'); // Sat 10 Oct, before the first window closes: first run looks back 7 days from Monday
  addNews(db, { from: 'z-delivery', topic: 'other', text: 'Too old to show.', issue: null, link: null, needsGeoff: false, tag: 'weekly-flag' });
  at('2026-10-15T01:00:00Z'); // Thu 15 Oct 12:00 Sydney
  addNews(db, { from: 'z-qa', topic: 'other', text: 'The kettle whistles twice.', issue: null, link: null, needsGeoff: false, tag: 'weekly-flag' });
  addNews(db, { from: 'z-qa', topic: 'other', text: 'A different tag.', issue: null, link: null, needsGeoff: false, tag: 'other-tag' });
  addNews(db, { from: 'z-qa', topic: 'other', text: 'No tag at all.', issue: null, link: null, needsGeoff: false });
  synced(syd(MON, '16:50'));
  tick(MON, '17:00');
  const first = outbox()[0]!.text;
  expect(first).toContain('Flags you kept:\n- The kettle whistles twice. (z-qa, Thu 12:00)\n\n');
  expect(first).not.toContain('Too old');
  expect(first).not.toContain('A different tag');
  // The next weekly shows only what came after this one.
  at('2026-10-21T01:00:00Z');
  addNews(db, { from: 'z-stu', topic: 'other', text: 'Late flag.', issue: null, link: null, needsGeoff: false, tag: 'weekly-flag' });
  const next = weeklyText(db, syd('2026-10-26', '17:00'));
  expect(next).toContain('Flags you kept:\n- Late flag. (z-stu, Wed 12:00)\n\n');
  expect(next).not.toContain('kettle');
  expect(weeklyText(db, syd('2026-11-02', '17:00'))).toContain('Flags you kept:\n- Late flag.');
});

test('with no flags the section says none', () => {
  expect(weeklyText(db, syd(MON, '17:00'))).toContain('Flags you kept:\nnone\n');
});

test('stale goals data makes it wait, and it sends once the data is fresh', () => {
  synced(syd(MON, '15:00'));
  expect(tick(MON, '17:00')).toEqual({ run: null, waiting: 'goals data 120 min old' });
  expect(outbox()).toEqual([]);
  expect(db.query('SELECT COUNT(*) AS n FROM job_runs').get()).toEqual({ n: 0 });
  synced(syd(MON, '17:02'));
  expect(tick(MON, '17:05').run).toMatchObject({ key: MON });
  expect(outbox()).toHaveLength(1);
});

test('data that was never synced waits; a Monday after 17:30 is sent late and marked so', () => {
  expect(tick(MON, '17:00').waiting).toBe('goals data never synced');
  synced(syd(MON, '17:40'));
  expect(tick(MON, '17:45').run).toMatchObject({ detail: 'late' });
});

test('a dry run is the text alone: nothing sent, no job row; a manual send runs once', () => {
  synced(syd(MON, '10:00'));
  const t = syd(MON, '10:10');
  weeklyText(db, t);
  expect(outbox()).toEqual([]);
  expect(db.query('SELECT COUNT(*) AS n FROM job_runs').get()).toEqual({ n: 0 });
  expect(sendWeekly(db, 'z-stu', t)).toMatchObject({ result: 'queued', detail: 'manual', key: MON });
  expect(() => sendWeekly(db, 'z-stu', t)).toThrow('already ran');
  expect(tick(MON, '17:00')).toEqual({ run: null, waiting: null });
  expect(outbox()).toHaveLength(1);
});

test('a manual send on a Thursday reviews the last complete week and keys on that Monday', () => {
  synced(syd('2026-10-22', '10:00'));
  expect(sendWeekly(db, 'z-stu', syd('2026-10-22', '10:10')).key).toBe(MON);
  expect(outbox()[0]!.text.split('\n')[0]).toBe('Goals weekly, week of 12 Oct:');
  const stale = () => sendWeekly(db, 'z-stu', syd('2026-11-05', '10:10'));
  expect(stale).toThrow('run hq goals sync first');
});

test('skip leaves a Monday alone; bad skips are refused', () => {
  synced(syd(MON, '16:50'));
  skipWeekly(db, MON, 'done by hand', 'z-stu');
  expect(tick(MON, '17:00')).toEqual({ run: null, waiting: null });
  expect(outbox()).toEqual([]);
  expect(() => skipWeekly(db, MON, 'again', 'z-stu')).toThrow('already ran');
  expect(() => skipWeekly(db, '2026-02-30', 'x', 'z-stu')).toThrow('Sydney Monday');
  expect(() => skipWeekly(db, '2026-10-20', 'x', 'z-stu')).toThrow('not a Monday');
  expect(() => skipWeekly(db, '2026-10-26', ' ', 'z-stu')).toThrow('--reason');
});

test('health is red at 17:31 on a Monday with no run, quiet before 17:30 and on other days, green once it ran', () => {
  expect(goalsWeeklyCheck(db, syd(MON, '17:29'))).toBeNull();
  expect(goalsWeeklyCheck(db, syd('2026-10-20', '17:31'))).toBeNull();
  expect(goalsWeeklyCheck(db, syd(MON, '17:31'))).toMatchObject({ key: 'job:goals-weekly', ok: false, line: expect.stringContaining('no run today (2026-10-19)') });
  synced(syd(MON, '16:50'));
  tick(MON, '17:05');
  expect(goalsWeeklyCheck(db, syd(MON, '17:31'))).toMatchObject({ ok: true });
  db.query("UPDATE outbox SET status = 'failed'").run();
  expect(goalsWeeklyCheck(db, syd(MON, '17:31'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
});

test('health still sees a failed message after the owner session is forwarded', () => {
  synced(syd(MON, '16:50'));
  tick(MON, '17:05');
  setForward(db, owner(), 'z-other');
  db.query("UPDATE outbox SET status = 'failed'").run();
  expect(db.query('SELECT target FROM outbox').get()).toEqual({ target: 'z-other' });
  expect(goalsWeeklyCheck(db, syd(MON, '17:31'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
});

test('health is red for a Monday whose data stayed stale', () => {
  synced(syd(MON, '09:00'));
  tick(MON, '17:35');
  expect(goalsWeeklyCheck(db, syd(MON, '17:35'))!.ok).toBe(false);
});

test('the deploy-prod row names holds, no-apply runs and runs not yet classified, and gets no colour while any is unclassified', () => {
  fetchedDays(db, undefined, undefined, ['atc', 'cloud']);
  const add = (id: number, outcome: string | null) => {
    db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, 'cloud', '.github/workflows/deploy-prod.yml', 'push', 'completed', 'success', 1, '2026-10-14T02:00:00Z', '2026-10-14T02:00:00Z', '2026-10-14T02:10:00Z')`).run(id);
    if (outcome) db.query(`INSERT INTO deploy_runs (run_id, outcome, attempt, fetched_at) VALUES (?, ?, 1, '2026-10-14T03:00:00Z')`).run(id, outcome);
  };
  for (let i = 1; i <= 10; i++) add(i, 'applied_ok');
  add(11, 'held');
  add(12, 'no_apply');
  expect(row(weeklyText(db, syd(MON, '17:00')), 'deploy-prod success')).toContain('| 100% of 10 applies, 1 held, 1 no-apply | no data (0 applies) | 🟢 green |');
  add(13, null);
  expect(row(weeklyText(db, syd(MON, '17:00')), 'deploy-prod success')).toContain('| 100% of 10 applies, 1 held, 1 no-apply, 1 not yet classified | no data (0 applies) | – |');
});

function recordRefusal(uuid: string, when: string, reason: string | null): void {
  db.query(`INSERT INTO refusals (uuid, at, transcript, subagent, reason, scanned_at) VALUES (?, ?, '/t.jsonl', 0, ?, '2026-10-19T00:00:00Z')`).run(uuid, when, reason);
}

test('the weekly ends with the week\'s refusals and their top reasons, after the flags', () => {
  recordRefusal('r1', '2026-10-13T01:00:00Z', 'pushing to main');
  recordRefusal('r2', '2026-10-14T01:00:00Z', 'pushing to main');
  recordRefusal('r3', '2026-10-15T01:00:00Z', 'deleting a branch');
  recordRefusal('r4', '2026-10-15T02:00:00Z', null);
  recordRefusal('r5', '2026-10-08T01:00:00Z', 'last week');
  recordRefusal('r6', '2026-10-19T08:00:00Z', 'this week, not yet reviewed');
  const text = weeklyText(db, syd(MON, '17:00'));
  expect(text).toContain('Refusals: 4 (top reasons: pushing to main x2; deleting a branch x1)');
  expect(text.indexOf('Flags you kept:')).toBeLessThan(text.indexOf('Refusals:'));
});

test('the weekly says when there were no refusals', () => {
  expect(weeklyText(db, syd(MON, '17:00'))).toContain('\nRefusals: none\n');
});
