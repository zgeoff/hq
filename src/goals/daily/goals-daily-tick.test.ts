import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { iso } from '../../clock/iso.ts';
import { setMeta } from '../../db/set-meta.ts';
import { dailyText } from './daily-text.ts';
import { goalsDailyCheck } from './goals-daily-check.ts';
import { goalsDailyTick } from './goals-daily-tick.ts';
import { sendDaily } from './send-daily.ts';
import { skipDaily } from './skip-daily.ts';
import { sydneyUtc } from '../../morning/sydney-utc.ts';
import type { Runner } from '../../runner/types.ts';
import { refreshActionsSpend } from '../refresh-actions-spend.ts';
import { setTarget } from '../set-target.ts';
import { at, fetchedDays, freshDb } from '../../../test/helpers.ts';
import { owner } from '../../owner.ts';
import { setForward } from '../../outbox/set-forward.ts';

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
const tick = (date: string, hm: string) => goalsDailyTick(db, 'hq-lanes', syd(date, hm));

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  process.env['HOME'] = dir;
  at('2026-10-16T01:00:00Z');
  fetchedDays(db);
});
afterEach(() => {
  process.env['HOME'] = home;
  cleanup();
});

test('nothing before 18:00', () => {
  synced(syd('2026-10-16', '17:40'));
  expect(tick('2026-10-16', '17:59')).toEqual({ run: null, waiting: null });
  expect(outbox()).toEqual([]);
});

test('at 18:00 one message goes to z-stu: 7 goal lines, 3 throughput lines and the incidents; a second tick sends nothing', () => {
  synced(syd('2026-10-16', '17:50'));
  const r = tick('2026-10-16', '18:01');
  expect(r.run).toMatchObject({ job: 'goals-daily', key: '2026-10-16', result: 'queued', detail: null });
  const [msg] = outbox();
  expect(outbox()).toHaveLength(1);
  expect(msg).toMatchObject({ target: 'z-stu', status: 'pending', topic: 'job:goals-daily:2026-10-16' });
  const lines = msg!.text.split('\n');
  expect(lines[0]).toBe('Goals check-in, Fri 16 Oct:');
  expect(lines).toHaveLength(13);
  expect(lines.slice(1, 11).map((goalLine) => goalLine.split(':')[0])).toEqual(['- Bug share', '- Feature + Improvement share', '- deploy-prod success', '- Nix downtime', '- CI minutes wasted', '- First review must-fix', '- Cost', '- Issues', '- Bad filings', '- Stale']);
  expect(lines[11]).toBe('Capacity: no recent reading');
  expect(lines[12]).toBe('Incidents today: none');
  for (const l of lines) expect(l.length).toBeLessThan(160);
  expect(lines[1]).toBe('- Bug share: today no data (0 typed PRs), week so far no data (0 typed PRs); target <20% by 2 Nov –');
  expect(tick('2026-10-16', '18:06')).toEqual({ run: null, waiting: null });
  expect(tick('2026-10-16', '23:59')).toEqual({ run: null, waiting: null });
  expect(outbox()).toHaveLength(1);
});

test('a line carries the colour as words after the emoji', () => {
  db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES ('GEO-1', 'Feature', 't', 'completed', NULL, '2026-10-16T00:00:00Z')`).run();
  db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES ('atc', 1, '2026-10-16T03:00:00Z', 'feat: x', 'feat', 'GEO-1')`).run();
  synced(syd('2026-10-16', '17:50'));
  const text = dailyText(db, syd('2026-10-16', '18:00'));
  expect(text).toContain('- Bug share: today 0% (1 typed PRs), week so far 0% (1 typed PRs); target <20% by 2 Nov 🟢 green');
  expect(text).toContain('- Feature + Improvement share: today 100% (1 typed PRs), week so far 100% (1 typed PRs); target >=60% 🟢 green');
  setTarget(db, 'bugs', '>', '50', 'z-stu');
  expect(dailyText(db, syd('2026-10-16', '18:00'))).toContain('target >50% by 2 Nov 🔴 red');
});

function findCostLine(when: Date): string | undefined {
  return dailyText(db, when)
    .split('\n')
    .find((l) => l.startsWith('- Cost'));
}

function makeActionsGh(netAmount: number): Runner {
  return () => Promise.resolve({ code: 0, stdout: JSON.stringify({ usageItems: [{ product: 'actions', netAmount }] }), stderr: '' });
}

test('the cost line shows the Actions spend as unknown, with no colour, before any reading', () => {
  expect(findCostLine(syd('2026-10-16', '18:00'))).toBe('- Cost: Actions spend unknown; Claude 7-day ? and 5-hour ? used at last reading (active account only), 7-day peak ?; CI 0 m…; target <=$50 a month on Actions –');
});

test('the cost line is green with the Actions spend under the pro-rated budget, beside the Claude usage', async () => {
  await refreshActionsSpend(db, makeActionsGh(12.5), syd('2026-10-16', '17:50'));

  expect(findCostLine(syd('2026-10-16', '18:00'))).toBe('- Cost: Actions $12.50 of $25.81 budget to date; Claude 7-day ? and 5-hour ? used at last reading (active account on…; target <=$50 a month on Actions 🟢 green');
});

test('the cost line is red with the Actions spend over the pro-rated budget', async () => {
  await refreshActionsSpend(db, makeActionsGh(31.07), syd('2026-10-16', '17:50'));

  expect(findCostLine(syd('2026-10-16', '18:00'))).toEndWith('; target <=$50 a month on Actions 🔴 red');
});

test('the cost line shows the spend as unknown when gh fails, never $0', async () => {
  await refreshActionsSpend(db, () => Promise.resolve({ code: 1, stdout: '', stderr: 'HTTP 403' }), syd('2026-10-16', '17:50'));

  const line = findCostLine(syd('2026-10-16', '18:00'));

  expect(line).toStartWith('- Cost: Actions spend unknown; ');
  expect(line).toEndWith('; target <=$50 a month on Actions –');
});

test('a long cost line gives up its middle and keeps the target and colour', async () => {
  db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run('2026-10-16T05:00:00Z', 'abcdef012345', 99, 99);
  await refreshActionsSpend(db, makeActionsGh(123_456.78), syd('2026-10-16', '17:50'));

  const line = findCostLine(syd('2026-10-16', '18:00'));

  expect(line).toStartWith('- Cost: Actions $123456.78 of $25.81 budget to date; Claude 7-day 99%');
  expect(line).toEndWith('…; target <=$50 a month on Actions 🔴 red');
  expect(line?.length).toBeLessThan(160);
});

test('incidents today list the outages opened today, with minutes', () => {
  db.query('INSERT INTO outages (started_at, detected_at, ended_at) VALUES (?, ?, ?)').run('2026-10-16T03:00:00Z', '2026-10-16T03:01:00Z', '2026-10-16T03:05:00Z');
  db.query('INSERT INTO outages (started_at, detected_at, ended_at) VALUES (?, ?, ?)').run('2026-10-15T03:00:00Z', '2026-10-15T03:01:00Z', '2026-10-15T03:20:00Z'); // yesterday
  for (let i = 0; i < 5; i++) db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, 0, 1)').run(iso(new Date(Date.parse('2026-10-16T03:00:00Z') + i * 60_000)));
  const last = dailyText(db, syd('2026-10-16', '18:00')).split('\n').at(-1);
  expect(last).toBe('Incidents today: Nix outage 14:00–14:05 Sydney, 5 min');
});

test('incidents today list an unready episode beside the outages, one line each', () => {
  db.query('INSERT INTO outages (started_at, detected_at, ended_at) VALUES (?, ?, ?)').run('2026-10-16T03:00:00Z', '2026-10-16T03:01:00Z', '2026-10-16T03:05:00Z');
  db.query("INSERT INTO outages (started_at, detected_at, ended_at, kind) VALUES (?, ?, ?, 'unready')").run('2026-10-16T05:00:00Z', '2026-10-16T05:03:00Z', '2026-10-16T05:12:00Z');
  for (let i = 0; i < 5; i++) db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, 0, 1)').run(iso(new Date(Date.parse('2026-10-16T03:00:00Z') + i * 60_000)));
  const last = dailyText(db, syd('2026-10-16', '18:00')).split('\n').at(-1);
  expect(last).toBe('Incidents today: Nix outage 14:00–14:05 Sydney, 5 min; Nix unready 16:00–16:12 (12 min)');
});

test('stale goals data makes it wait, and it sends once the data is fresh', () => {
  synced(syd('2026-10-16', '16:00')); // 2 hours old at 18:00
  expect(tick('2026-10-16', '18:00')).toEqual({ run: null, waiting: 'goals data 120 min old' });
  expect(outbox()).toEqual([]);
  expect(db.query('SELECT COUNT(*) AS n FROM job_runs').get()).toEqual({ n: 0 });
  synced(syd('2026-10-16', '18:02'));
  expect(tick('2026-10-16', '18:05').run).toMatchObject({ key: '2026-10-16' });
  expect(outbox()).toHaveLength(1);
});

test('goals data that was never synced waits too; 35 minutes old still sends', () => {
  expect(tick('2026-10-16', '18:00').waiting).toBe('goals data never synced');
  synced(syd('2026-10-16', '17:25'));
  expect(tick('2026-10-16', '18:00').run).not.toBeNull();
});

test('a day after 18:30 is sent late and marked so', () => {
  synced(syd('2026-10-17', '18:40'));
  expect(tick('2026-10-17', '18:45').run).toMatchObject({ detail: 'late' });
});

test('hq goals daily sends now, once; a dry run sends nothing and writes no job row', () => {
  synced(syd('2026-10-16', '10:00'));
  const t = syd('2026-10-16', '10:10');
  dailyText(db, t); // the dry run is this text and no write
  expect(outbox()).toEqual([]);
  expect(db.query('SELECT COUNT(*) AS n FROM job_runs').get()).toEqual({ n: 0 });
  expect(sendDaily(db, 'z-stu', t)).toMatchObject({ result: 'queued', detail: 'manual' });
  expect(outbox()).toHaveLength(1);
  expect(() => sendDaily(db, 'z-stu', t)).toThrow('already ran');
  expect(tick('2026-10-16', '18:00')).toEqual({ run: null, waiting: null });
});

test('a manual send refuses stale data', () => {
  synced(syd('2026-10-16', '08:00'));
  expect(() => sendDaily(db, 'z-stu', syd('2026-10-16', '10:10'))).toThrow('run hq goals sync first');
  expect(outbox()).toEqual([]);
});

test('skip leaves a day alone; bad skips are refused', () => {
  synced(syd('2026-10-16', '17:50'));
  skipDaily(db, '2026-10-16', 'done by hand', 'z-stu');
  expect(tick('2026-10-16', '18:00')).toEqual({ run: null, waiting: null });
  expect(outbox()).toEqual([]);
  expect(() => skipDaily(db, '2026-10-16', 'again', 'z-stu')).toThrow('already ran');
  expect(() => skipDaily(db, '2026-02-30', 'x', 'z-stu')).toThrow('Sydney date');
  expect(() => skipDaily(db, '2026-10-17', ' ', 'z-stu')).toThrow('--reason');
});

test('health is red at 18:31 with no run, quiet before 18:30, green once it ran', () => {
  expect(goalsDailyCheck(db, syd('2026-10-16', '18:29'))).toBeNull();
  expect(goalsDailyCheck(db, syd('2026-10-16', '18:31'))).toMatchObject({ key: 'job:goals-daily', ok: false, line: expect.stringContaining('no run today (2026-10-16)') });
  synced(syd('2026-10-16', '17:50'));
  tick('2026-10-16', '18:05');
  expect(goalsDailyCheck(db, syd('2026-10-16', '18:31'))).toMatchObject({ ok: true });
  db.query("UPDATE outbox SET status = 'failed'").run();
  expect(goalsDailyCheck(db, syd('2026-10-16', '18:31'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
});

test('it still sees a failed message after the owner session is forwarded', () => {
  synced(syd('2026-10-16', '17:50'));
  tick('2026-10-16', '18:05');
  setForward(db, owner(), 'z-other');
  db.query("UPDATE outbox SET status = 'failed'").run();

  expect(goalsDailyCheck(db, syd('2026-10-16', '18:31'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
});

test('health is red for a day whose data stayed stale', () => {
  synced(syd('2026-10-16', '09:00'));
  tick('2026-10-16', '18:35');
  expect(goalsDailyCheck(db, syd('2026-10-16', '18:35'))!.ok).toBe(false);
});

test('only a sync without failed fetches counts as fresh: goals_synced_at alone does not', () => {
  setMeta(db, 'goals_synced_at', iso(syd('2026-10-16', '17:55'))); // the watcher stamps this even on failed fetches
  expect(tick('2026-10-16', '18:00').waiting).toBe('goals data never synced');
  synced(syd('2026-10-16', '17:55')); // a clean sync, from the watcher or hq goals sync
  expect(tick('2026-10-16', '18:00').run).not.toBeNull();
});

test('stale merged-PR kinds or Linear types hold the check-in even when CI is fresh', () => {
  synced(syd('2026-10-16', '17:55'));
  setMeta(db, 'kinds_ok_at', iso(syd('2026-10-16', '10:00')));
  expect(tick('2026-10-16', '18:00').waiting).toBe('goals data 480 min old');
  setMeta(db, 'kinds_ok_at', iso(syd('2026-10-16', '17:55')));
  setMeta(db, 'linear_synced_at', iso(syd('2026-10-16', '10:00')));
  expect(tick('2026-10-16', '18:00').run).toBeNull();
  setMeta(db, 'linear_synced_at', iso(syd('2026-10-16', '17:55')));
  expect(tick('2026-10-16', '18:00').run).not.toBeNull();
});

test('the deploy-prod line names holds, no-apply runs and runs not yet classified', () => {
  fetchedDays(db, undefined, undefined, ['atc', 'cloud']);
  const add = (id: number, outcome: string | null) => {
    db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, 'cloud', '.github/workflows/deploy-prod.yml', 'push', 'completed', 'success', 1, '2026-10-16T02:00:00Z', '2026-10-16T02:00:00Z', '2026-10-16T02:10:00Z')`).run(id);
    if (outcome) db.query(`INSERT INTO deploy_runs (run_id, outcome, attempt, fetched_at) VALUES (?, ?, 1, '2026-10-16T03:00:00Z')`).run(id, outcome);
  };
  add(1, 'applied_ok');
  add(2, 'held');
  add(3, 'held');
  add(4, 'no_apply');
  synced(syd('2026-10-16', '17:50'));
  const line = (t: string) => t.split('\n').find((l) => l.startsWith('- deploy-prod success'))!;
  expect(line(dailyText(db, syd('2026-10-16', '18:00')))).toContain('today 100% (1 applies), 2 held, 1 no-apply, week so far 100% (1 applies), 2 held, 1 no-apply;');
  add(5, null);
  const l = line(dailyText(db, syd('2026-10-16', '18:00')));
  expect(l).toContain('today 100% (1 applies), 2 held, 1 no-apply, 1 not yet classified,');
  expect(l).toMatch(/; target >=90% –$/); // no colour while a run is unclassified, and the long line keeps it
});
