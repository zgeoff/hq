import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { iso } from '../../clock/iso.ts';
import { setMeta } from '../../db/set-meta.ts';
import { readOutboxRows } from '../../outbox/read-outbox-rows.ts';
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
import { markOutboxFailed } from '../../outbox/mark-outbox-failed.ts';
import { unsent } from '../../outbox/unsent.ts';
import { buildSeeder } from '../../test-utils/build-seeder.ts';

const syd = (date: string, hm: string) => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return sydneyUtc(y!, mo!, d!, h!, mi!);
};
const MON = '2026-10-19';
const row = (text: string, name: string) => text.split('\n').find((l) => l.startsWith(`| ${name}`))!;

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  updateEnv('HOME', fresh.dir);
  at('2026-10-19T05:00:00Z');

  return {
    db: fresh.db,
    seed: buildSeeder(fresh),
    tick: (date: string, hm: string) => goalsWeeklyTick(fresh.db, 'hq-lanes', syd(date, hm)),
    synced: (when: Date) => {
      for (const key of ['goals_ok_at', 'kinds_ok_at', 'linear_synced_at']) {
        setMeta(fresh.db, key, iso(when));
      }
    },
  };
}

function makeActionsGh(netAmount: number): Runner {
  return () => Promise.resolve({ code: 0, stdout: JSON.stringify({ usageItems: [{ product: 'actions', netAmount }] }), stderr: '' });
}

test('nothing before Monday 17:00, and nothing on another day', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.synced(syd(MON, '16:40'));
  expect(ctx.tick(MON, '16:59')).toStrictEqual({ run: null, waiting: null });
  ctx.synced(syd('2026-10-20', '17:40'));
  expect(ctx.tick('2026-10-20', '17:05')).toStrictEqual({ run: null, waiting: null });
  expect(ctx.tick('2026-10-18', '17:05')).toStrictEqual({ run: null, waiting: null });
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
});

test('at Monday 17:00 one message goes to z-stu with the table, both weeks and the flags; a second tick sends nothing', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes linear_issues
  const writeIssue = ctx.db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES (?, ?, 't', 'completed', NULL, '2026-10-16T00:00:00Z')`);
  writeIssue.run('GEO-1', 'Bug');
  writeIssue.run('GEO-2', 'Feature');
  // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes merged_prs
  const writeMergedPR = ctx.db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', ?, ?, 'x: y', 'other', ?)`);
  writeMergedPR.run(1, '2026-10-14T03:00:00Z', 'GEO-1');
  writeMergedPR.run(2, '2026-10-15T03:00:00Z', 'GEO-2');
  writeMergedPR.run(3, '2026-10-08T03:00:00Z', 'GEO-2');
  writeMergedPR.run(4, '2026-10-19T03:00:00Z', 'GEO-2');
  ctx.synced(syd(MON, '16:50'));
  const result = ctx.tick(MON, '17:01');
  expect(result.run).toMatchObject({ job: 'goals-weekly', key: MON, result: 'queued', detail: null });
  expect(readOutboxRows(ctx.db)).toHaveLength(1);
  const [message] = readOutboxRows(ctx.db);
  expect(message).toMatchObject({ target: 'z-stu', status: 'pending', topic: 'job:goals-weekly:2026-10-19' });
  const text = message?.text ?? '';
  const lines = text.split('\n');
  expect(lines[0]).toBe('Goals weekly, week of 12 Oct:');
  expect(lines).toContain('| goal | target | this week | last week | |');
  expect(row(text, 'Bug share')).toBe('| Bug share | <20% by 2 Nov | 50% of 2 typed PRs | 0% of 1 typed PRs | 🔴 red |');
  expect(row(text, 'Feature + Improvement share')).toBe('| Feature + Improvement share | >=60% | 50% of 2 typed PRs | 100% of 1 typed PRs | 🔴 red |');
  expect(row(text, 'deploy-prod success')).toContain('| >=90% | no data (0 applies) | no data (0 applies) | – |');
  expect(lines.filter((line) => line.startsWith('| ')).length).toBe(2 + 7);
  expect(lines).toContain('Flags you kept:');
  expect(lines.at(-1)).toBe('Targets live in hq config: hq goals targets; move one with hq goals target <key> <op> <value>.');
  expect(ctx.tick(MON, '17:06')).toStrictEqual({ run: null, waiting: null });
  expect(ctx.tick(MON, '23:59')).toStrictEqual({ run: null, waiting: null });
  expect(readOutboxRows(ctx.db)).toHaveLength(1);
});

test('a green row says so, and the colour follows the unrounded share', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes linear_issues
  ctx.db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES ('GEO-1', 'Feature', 't', 'completed', NULL, '2026-10-16T00:00:00Z')`).run();
  // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes merged_prs
  ctx.db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', 1, '2026-10-14T03:00:00Z', 'x: y', 'other', 'GEO-1')`).run();
  const text = weeklyText(ctx.db, syd(MON, '17:00'));
  expect(row(text, 'Feature + Improvement share')).toContain('100% of 1 typed PRs | no data (0 typed PRs) | 🟢 green |');
});

test('a week with days not fetched says so and gets no colour', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes linear_issues
  ctx.db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES ('GEO-1', 'Feature', 't', 'completed', NULL, '2026-10-16T00:00:00Z')`).run();
  // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes merged_prs
  ctx.db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', 1, '2026-10-14T03:00:00Z', 'x: y', 'other', 'GEO-1')`).run();
  // oxlint-disable-next-line zgeoff/seed-only -- no seed leaves a day unfetched
  ctx.db.query(`DELETE FROM merged_pr_days WHERE day IN ('2026-10-12', '2026-10-13')`).run();
  const text = weeklyText(ctx.db, syd(MON, '17:00'));
  expect(row(text, 'Feature + Improvement share')).toContain('100% of 1 typed PRs, 2 day(s) not fetched | no data (0 typed PRs) | – |');
  // oxlint-disable-next-line zgeoff/seed-only -- no seed leaves a day unfetched
  ctx.db.query(`DELETE FROM goal_days WHERE day = '2026-10-08'`).run();
  const unfetched = weeklyText(ctx.db, syd(MON, '17:00'));
  expect(row(unfetched, 'CI minutes wasted')).toContain('| no data (0 CI min, 1 day(s) not fetched) |');
});

test('the downtime row gives outages, the slowest detection and blind minutes, judged on exact durations', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  const t0 = Date.parse('2026-10-14T01:00:00Z');
  const z = (ms: number) => iso(new Date(t0 + ms));
  for (const minute of Array.from({ length: 20 }, (_, offset) => offset - 20)) {
    ctx.seed.probeSample({ at: z(minute * 60_000) });
  }
  for (const minute of [0, 1, 2, 3]) {
    ctx.seed.downProbeSample({ at: z(minute * 60_000) });
  }
  for (const minute of Array.from({ length: 36 }, (_, offset) => offset + 4)) {
    ctx.seed.probeSample({ at: z(minute * 60_000) });
  }
  ctx.seed.closedOutage({ startedAt: z(0), detectedAt: z(2 * 60_000), endedAt: z(4 * 60_000) });
  const text = weeklyText(ctx.db, syd(MON, '17:00'));
  expect(row(text, 'Nix downtime')).toMatch(/^\| Nix downtime \| <15 min a week, each outage caught within 5 min \| 4 min down, 1 outage\(s\), slowest caught in 2 min, [\d.]+ min blind \(\d+ samples\) \| no data \(0 samples\) \| 🟢 green \|$/);
});

test('the cost row names an account by its label when set, else by the short key, with CI minutes and no colour', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.seed.usageSample({ at: '2026-10-13T01:00:00Z', account: 'abcdef012345', five_hour: 10, seven_day: 40 });
  ctx.seed.usageSample({ at: '2026-10-14T01:00:00Z', account: 'abcdef012345', five_hour: 20, seven_day: 71 });
  ctx.seed.usageSample({ at: '2026-10-15T01:00:00Z', account: 'abcdef012345', five_hour: 30, seven_day: 55 });
  ctx.seed.usageSample({ at: '2026-10-15T02:00:00Z', account: '0123456789ab', five_hour: 5, seven_day: 12 });
  ctx.seed.usageSample({ at: '2026-10-07T01:00:00Z', account: 'abcdef012345', five_hour: 1, seven_day: 33 });
  // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes ci_runs
  ctx.db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (1, 'atc', 'ci.yml', 'push', 'completed', 'success', 1, '2026-10-14T02:00:00Z', '2026-10-14T02:00:00Z', '2026-10-14T03:30:00Z')`).run();
  let cost = row(weeklyText(ctx.db, syd(MON, '17:00')), 'Cost');
  expect(cost).toContain('012345: 7-day peak 12%, latest 5-hour 5% and 7-day 12% (1 readings)');
  expect(cost).toContain('abcdef: 7-day peak 71%, latest 5-hour 30% and 7-day 55% (3 readings); CI 90 min');
  expect(cost).toContain('abcdef: 7-day peak 33%, latest 5-hour 1% and 7-day 33% (1 readings); CI 0 min');
  expect(cost.endsWith('| – |')).toBe(true);
  expect(cost).toContain('| <=$50 a month on Actions | Actions spend unknown; ');
  setAccountLabel(ctx.db, 'abcdef012345', 'work', 'z-stu');
  cost = row(weeklyText(ctx.db, syd(MON, '17:00')), 'Cost');
  expect(cost).toContain('work: 7-day peak 71%');
  expect(cost).not.toContain('abcdef:');
  expect(cost).toContain('012345: 7-day peak 12%');
});

test('the cost colour is green with the Actions spend under the pro-rated budget, whatever the Claude peaks', async () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.seed.usageSample({ at: '2026-10-13T01:00:00Z', account: 'aaaaaaaaaaaa', five_hour: 10, seven_day: 95 });
  await refreshActionsSpend(ctx.db, makeActionsGh(30.64), syd(MON, '16:45'));

  const cost = row(weeklyText(ctx.db, syd(MON, '17:00')), 'Cost');

  expect(cost).toContain('| Actions $30.64 of $30.65 budget to date; aaaaaa: 7-day peak 95%');
  expect(cost).toEndWith('| 🟢 green |');
});

test('the cost colour is red with the Actions spend over the pro-rated budget', async () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.seed.usageSample({ at: '2026-10-13T01:00:00Z', account: 'aaaaaaaaaaaa', five_hour: 10, seven_day: 20 });
  await refreshActionsSpend(ctx.db, makeActionsGh(30.66), syd(MON, '16:45'));

  const cost = row(weeklyText(ctx.db, syd(MON, '17:00')), 'Cost');

  expect(cost).toContain('| Actions $30.66 of $30.65 budget to date; aaaaaa: 7-day peak 20%');
  expect(cost).toEndWith('| 🔴 red |');
});

test('the cost row shows the Actions spend as unknown, with no colour, when gh fails', async () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  await refreshActionsSpend(ctx.db, () => Promise.resolve({ code: 1, stdout: '', stderr: 'HTTP 403' }), syd(MON, '16:45'));

  const cost = row(weeklyText(ctx.db, syd(MON, '17:00')), 'Cost');

  expect(cost).toContain('| Actions spend unknown; ');
  expect(cost).toEndWith('| – |');
});

test('legacy active readings stay in a mixed week beside the keyed ones', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.seed.usageSample({ at: '2026-10-13T01:00:00Z', account: 'active', five_hour: 10, seven_day: 95 });
  ctx.seed.usageSample({ at: '2026-10-15T01:00:00Z', account: 'bbbbbbbbbbbb', five_hour: 5, seven_day: 20 });
  const cost = row(weeklyText(ctx.db, syd(MON, '17:00')), 'Cost');
  expect(cost).toContain('active: 7-day peak 95%');
  expect(cost).toContain('bbbbbb: 7-day peak 20%');
});

test('the cost row says active account only when a week has no per-account rows', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  const before = row(weeklyText(ctx.db, syd(MON, '17:00')), 'Cost');
  expect(before).toContain('active account only: no readings');
  ctx.seed.usageSample({ at: '2026-10-14T01:00:00Z', account: 'active', five_hour: 20, seven_day: 60 });
  const cost = row(weeklyText(ctx.db, syd(MON, '17:00')), 'Cost');
  expect(cost).toContain('active account only: 7-day peak 60%, latest 5-hour 20% and 7-day 60% (1 readings)');
  expect(cost).toContain('active account only: no readings');
});

test('flags are the weekly-flag items since the last weekly, filtered by tag and by time', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  at('2026-10-10T01:00:00Z');
  addNews(ctx.db, { from: 'z-delivery', topic: 'other', text: 'Too old to show.', issue: null, link: null, needsGeoff: false, tag: 'weekly-flag' });
  at('2026-10-15T01:00:00Z');
  addNews(ctx.db, { from: 'z-qa', topic: 'other', text: 'The kettle whistles twice.', issue: null, link: null, needsGeoff: false, tag: 'weekly-flag' });
  addNews(ctx.db, { from: 'z-qa', topic: 'other', text: 'A different tag.', issue: null, link: null, needsGeoff: false, tag: 'other-tag' });
  addNews(ctx.db, { from: 'z-qa', topic: 'other', text: 'No tag at all.', issue: null, link: null, needsGeoff: false });
  ctx.synced(syd(MON, '16:50'));
  ctx.tick(MON, '17:00');
  const first = readOutboxRows(ctx.db)[0]?.text;
  expect(first).toContain('Flags you kept:\n- The kettle whistles twice. (z-qa, Thu 12:00)\n\n');
  expect(first).not.toContain('Too old');
  expect(first).not.toContain('A different tag');
  at('2026-10-21T01:00:00Z');
  addNews(ctx.db, { from: 'z-stu', topic: 'other', text: 'Late flag.', issue: null, link: null, needsGeoff: false, tag: 'weekly-flag' });
  const next = weeklyText(ctx.db, syd('2026-10-26', '17:00'));
  expect(next).toContain('Flags you kept:\n- Late flag. (z-stu, Wed 12:00)\n\n');
  expect(next).not.toContain('kettle');
  expect(weeklyText(ctx.db, syd('2026-11-02', '17:00'))).toContain('Flags you kept:\n- Late flag.');
});

test('with no flags the section says none', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  expect(weeklyText(ctx.db, syd(MON, '17:00'))).toContain('Flags you kept:\nnone\n');
});

test('stale goals data makes it wait, and it sends once the data is fresh', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.synced(syd(MON, '15:00'));
  expect(ctx.tick(MON, '17:00')).toStrictEqual({ run: null, waiting: 'goals data 120 min old' });
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM job_runs').get()).toStrictEqual({ count: 0 });
  ctx.synced(syd(MON, '17:02'));
  expect(ctx.tick(MON, '17:05').run).toMatchObject({ key: MON });
  expect(readOutboxRows(ctx.db)).toHaveLength(1);
});

test('data that was never synced waits; a Monday after 17:30 is sent late and marked so', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  expect(ctx.tick(MON, '17:00').waiting).toBe('goals data never synced');
  ctx.synced(syd(MON, '17:40'));
  expect(ctx.tick(MON, '17:45').run).toMatchObject({ detail: 'late' });
});

test('a dry run is the text alone: nothing sent, no job row; a manual send runs once', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.synced(syd(MON, '10:00'));
  const sentAt = syd(MON, '10:10');
  weeklyText(ctx.db, sentAt);
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM job_runs').get()).toStrictEqual({ count: 0 });
  expect(sendWeekly(ctx.db, 'z-stu', sentAt)).toMatchObject({ result: 'queued', detail: 'manual', key: MON });
  expect(() => sendWeekly(ctx.db, 'z-stu', sentAt)).toThrow('already ran');
  expect(ctx.tick(MON, '17:00')).toStrictEqual({ run: null, waiting: null });
  expect(readOutboxRows(ctx.db)).toHaveLength(1);
});

test('a manual send on a Thursday reviews the last complete week and keys on that Monday', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.synced(syd('2026-10-22', '10:00'));
  expect(sendWeekly(ctx.db, 'z-stu', syd('2026-10-22', '10:10')).key).toBe(MON);
  expect(readOutboxRows(ctx.db)[0]?.text.split('\n')[0]).toBe('Goals weekly, week of 12 Oct:');
  const stale = () => sendWeekly(ctx.db, 'z-stu', syd('2026-11-05', '10:10'));
  expect(stale).toThrow('run hq goals sync first');
});

test('skip leaves a Monday alone; bad skips are refused', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.synced(syd(MON, '16:50'));
  skipWeekly(ctx.db, MON, 'done by hand', 'z-stu');
  expect(ctx.tick(MON, '17:00')).toStrictEqual({ run: null, waiting: null });
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
  expect(() => skipWeekly(ctx.db, MON, 'again', 'z-stu')).toThrow('already ran');
  expect(() => skipWeekly(ctx.db, '2026-02-30', 'x', 'z-stu')).toThrow('Sydney Monday');
  expect(() => skipWeekly(ctx.db, '2026-10-20', 'x', 'z-stu')).toThrow('not a Monday');
  expect(() => skipWeekly(ctx.db, '2026-10-26', ' ', 'z-stu')).toThrow('--reason');
});

test('health is red at 17:31 on a Monday with no run, quiet before 17:30 and on other days, green once it ran', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  expect(goalsWeeklyCheck(ctx.db, syd(MON, '17:29'))).toBeNull();
  expect(goalsWeeklyCheck(ctx.db, syd('2026-10-20', '17:31'))).toBeNull();
  expect(goalsWeeklyCheck(ctx.db, syd(MON, '17:31'))).toMatchObject({ key: 'job:goals-weekly', ok: false, line: expect.stringContaining('no run today (2026-10-19)') });
  ctx.synced(syd(MON, '16:50'));
  ctx.tick(MON, '17:05');
  expect(goalsWeeklyCheck(ctx.db, syd(MON, '17:31'))).toMatchObject({ ok: true });
  markOutboxFailed(ctx.db, unsent(ctx.db, false, undefined), 'invented send failure');
  expect(goalsWeeklyCheck(ctx.db, syd(MON, '17:31'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
});

test('health still sees a failed message after the owner session is forwarded', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.synced(syd(MON, '16:50'));
  ctx.tick(MON, '17:05');
  setForward(ctx.db, owner(), 'z-other');
  markOutboxFailed(ctx.db, unsent(ctx.db, false, undefined), 'invented send failure');
  expect(readOutboxRows(ctx.db).map((message) => message.target)).toStrictEqual(['z-other']);
  expect(goalsWeeklyCheck(ctx.db, syd(MON, '17:31'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
});

test('health is red for a Monday whose data stayed stale', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  ctx.synced(syd(MON, '09:00'));
  ctx.tick(MON, '17:35');
  expect(goalsWeeklyCheck(ctx.db, syd(MON, '17:35'))?.ok).toBe(false);
});

test('the deploy-prod row names holds, no-apply runs and runs not yet classified, and gets no colour while any is unclassified', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db, undefined, undefined, ['atc', 'cloud']);
  const add = (id: number, outcome: string | null) => {
    // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes ci_runs
    ctx.db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, 'cloud', '.github/workflows/deploy-prod.yml', 'push', 'completed', 'success', 1, '2026-10-14T02:00:00Z', '2026-10-14T02:00:00Z', '2026-10-14T02:10:00Z')`).run(id);
    if (outcome) {
      // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes deploy_runs
      ctx.db.query(`INSERT INTO deploy_runs (run_id, outcome, attempt, fetched_at) VALUES (?, ?, 1, '2026-10-14T03:00:00Z')`).run(id, outcome);
    }
  };
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    add(id, 'applied_ok');
  }
  add(11, 'held');
  add(12, 'no_apply');
  const classified = weeklyText(ctx.db, syd(MON, '17:00'));
  expect(row(classified, 'deploy-prod success')).toContain('| 100% of 10 applies, 1 held, 1 no-apply | no data (0 applies) | 🟢 green |');
  add(13, null);
  const unclassified = weeklyText(ctx.db, syd(MON, '17:00'));
  expect(row(unclassified, 'deploy-prod success')).toContain('| 100% of 10 applies, 1 held, 1 no-apply, 1 not yet classified | no data (0 applies) | – |');
});

test('the weekly ends with the week\'s refusals and their top reasons, after the flags', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  // oxlint-disable-next-line zgeoff/seed-only -- no seed publishes refusals
  const writeRefusal = ctx.db.query(`INSERT INTO refusals (uuid, at, transcript, subagent, reason, scanned_at) VALUES (?, ?, '/t.jsonl', 0, ?, '2026-10-19T00:00:00Z')`);
  writeRefusal.run('r1', '2026-10-13T01:00:00Z', 'pushing to main');
  writeRefusal.run('r2', '2026-10-14T01:00:00Z', 'pushing to main');
  writeRefusal.run('r3', '2026-10-15T01:00:00Z', 'deleting a branch');
  writeRefusal.run('r4', '2026-10-15T02:00:00Z', null);
  writeRefusal.run('r5', '2026-10-08T01:00:00Z', 'last week');
  writeRefusal.run('r6', '2026-10-19T08:00:00Z', 'this week, not yet reviewed');
  const text = weeklyText(ctx.db, syd(MON, '17:00'));
  expect(text).toContain('Refusals: 4 (top reasons: pushing to main x2; deleting a branch x1)');
  expect(text.indexOf('Flags you kept:')).toBeLessThan(text.indexOf('Refusals:'));
});

test('the weekly says when there were no refusals', () => {
  const ctx = setupTest();
  fetchedDays(ctx.db);
  expect(weeklyText(ctx.db, syd(MON, '17:00'))).toContain('\nRefusals: none\n');
});
