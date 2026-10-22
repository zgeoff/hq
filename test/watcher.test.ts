import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { addPr } from '../src/runs/add-pr.ts';
import { addRun } from '../src/runs/add-run.ts';
import { addAsk } from '../src/asks/add-ask.ts';
import { owner } from '../src/owner.ts';
import { getMeta } from '../src/db/get-meta.ts';
import { setMeta } from '../src/db/set-meta.ts';
import type { Runner } from '../src/runner/types.ts';
import { main } from '../src/cli.ts';
import { LAST_TICK } from '../src/watcher/last-tick.ts';
import type { WatchDeps } from '../src/watcher/types.ts';
import { watchTick } from '../src/watcher/watch-tick.ts';
import { sendStaleWatcherAlerts } from '../src/watcher/send-stale-watcher-alerts.ts';
import { watcherAlert } from '../src/watcher/watcher-alert.ts';
import { watcherState } from '../src/watcher/watcher-state.ts';
import { withDeadline } from '../src/watcher/with-deadline.ts';
import { DEPLOY } from '../src/goals/deploy.ts';
import { addUnblock } from '../src/unblock/add-unblock.ts';
import { getUnblock } from '../src/unblock/get-unblock.ts';
import { at, fakeAtc, freshDb } from './helpers.ts';
import { buildStubGitHubFactsRunner } from './build-stub-github-facts-runner.ts';
import { makePRStateGh } from './make-pr-state-gh.ts';
import { IN_SCOPE } from '../src/scope/in-scope.ts';

let db: Database;
let dir: string;
let cleanup: () => void;
let logs: string[];
const home = process.env['HOME'],
  xdg = process.env['XDG_CACHE_HOME'];

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());

  // no live checkout, trust file or capacity script
  process.env['HOME'] = dir;

  // nor the live usage cache
  delete process.env['XDG_CACHE_HOME'];
  at('2026-10-15T20:00:00Z'); // 07:00 Sydney: before the morning-reports job
  process.env['HQ_NOTIFY'] = 'off';
  setMeta(db, 'kinds_synced_at', new Date().toISOString()); // no GitHub or Linear in these tests
  setMeta(db, 'goals_synced_at', new Date().toISOString());
  setMeta(db, 'goals_ok_at', new Date().toISOString());
  setMeta(db, 'kinds_ok_at', new Date().toISOString());
  setMeta(db, 'linear_synced_at', new Date().toISOString());
  setMeta(db, 'lanes_ready_linear_at', new Date().toISOString());
  logs = [];
});
afterEach(() => {
  delete process.env['HQ_NOTIFY'];
  delete process.env['HQ_ATC_SOCKET'];
  process.env['HOME'] = home;
  if (xdg === undefined) {
    delete process.env['XDG_CACHE_HOME'];
  } else {
    process.env['XDG_CACHE_HOME'] = xdg;
  }
  cleanup();
});

const capacity: Runner = async () => ({ code: 0, stdout: JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } }), stderr: '' });

function deps(over: Partial<WatchDeps['steps']> = {}, run: Runner = capacity): WatchDeps {
  return {
    me: 'hq-lanes',
    run,
    log: (l) => logs.push(l),
    stepMs: 200,
    steps: { runs: async () => {}, weekly: async () => false, health: async () => ({ opened: [], cleared: [] }), ...over },
  };
}

const outbox = () => db.query('SELECT target, text, topic FROM outbox ORDER BY id').all() as { target: string; text: string; topic: string | null }[];

test('a completed tick records its time', async () => {
  expect(getMeta(db, LAST_TICK)).toBeNull();
  expect(await watchTick(db, deps())).toBe(true);
  expect(getMeta(db, LAST_TICK)).toBe('2026-10-15T20:00:00Z');
  expect(logs.at(-1)).toContain('slots=');
});

test('a tick queues the morning call ready and the unblock list changed for the owner', async () => {
  addAsk(db, { kind: 'call', id: 'geo-1-paint', title: 'Paint the shed', question: 'Green or grey?', body: 'Green or grey? Recommendation: green.', issues: ['GEO-1'], forSession: 'z-delivery', actor: 'z-refine' });
  addUnblock(db, { id: 'kettle', task: 'Try the new kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });

  const done = await watchTick(db, deps()),
    sent = db.query("SELECT target, text, topic FROM outbox WHERE topic IN ('call-ready-morning', 'unblock-changed') ORDER BY topic").all();

  expect(done).toBe(true);
  expect(sent).toStrictEqual([
    { target: owner(), text: 'call ready', topic: 'call-ready-morning' },
    { target: owner(), text: 'unblock list changed', topic: 'unblock-changed' },
  ]);
});

test('a hanging step costs that step, not the loop; the tick still completes', async () => {
  const hang = () => new Promise<never>(() => {});
  const t0 = Date.now();
  expect(await watchTick(db, deps({ weekly: hang, health: hang }))).toBe(true);
  expect(Date.now() - t0).toBeLessThan(2_000);
  expect(logs.some((l) => l.includes('weekly stats failed: weekly stats did not finish'))).toBe(true);
  expect(logs.some((l) => l.includes('health failed: health did not finish'))).toBe(true);
  expect(getMeta(db, LAST_TICK)).not.toBeNull();
});

test('a hanging capacity read or sweep fails the tick, which then records no time', async () => {
  const hung: Runner = () => new Promise(() => {});
  expect(await watchTick(db, deps({}, hung))).toBe(false);
  expect(logs.at(-1)).toContain('tick failed: capacity did not finish');
  expect(await watchTick(db, deps({ runs: () => new Promise(() => {}) }))).toBe(false);
  expect(logs.at(-1)).toContain('tick failed: notes and sweep did not finish');
  expect(getMeta(db, LAST_TICK)).toBeNull();
});

test('withDeadline passes a result through and clears its timer', async () => {
  expect(await withDeadline(Promise.resolve(3), 50, 'x')).toBe(3);
  await expect(withDeadline(Promise.reject(new Error('inner')), 50, 'x')).rejects.toThrow('inner');
});

test('a watcher with no tick for 15 min alerts z-stu once, and once more when it recovers', async () => {
  expect(watcherState(db)).toMatchObject({ since: null, stale: false }); // never ran: no alert
  expect(watcherAlert(db, 'hq-fleet')).toBeNull();
  await watchTick(db, deps());
  at('2026-10-15T20:14:00Z');
  expect(watcherAlert(db, 'hq-fleet')).toBeNull();
  at('2026-10-15T20:15:00Z');
  expect(watcherState(db)).toMatchObject({ stale: true, minutes: 15 });
  expect(watcherAlert(db, 'hq-fleet')).toBe('alerted');
  at('2026-10-15T20:20:00Z');
  expect(watcherAlert(db, 'hq-fleet')).toBeNull(); // once per stale spell
  expect(outbox()).toEqual([{ target: 'z-stu', text: expect.stringContaining('no completed tick for 15 min (last 2026-10-15T20:00:00Z)'), topic: 'watcher-stale' }]);
  await watchTick(db, deps());
  expect(watcherAlert(db, 'hq-fleet')).toBe('recovered');
  expect(outbox().at(-1)).toMatchObject({ target: 'z-stu', text: expect.stringContaining('ticking again') });
  expect(watcherAlert(db, 'hq-fleet')).toBeNull();
});

test('a watcher that started but never completed a tick counts from its start', () => {
  setMeta(db, 'watcher_started_at', '2026-10-15T19:40:00Z');
  expect(watcherState(db)).toMatchObject({ lastTick: null, stale: true, minutes: 20 });
  expect(watcherAlert(db, 'hq-fleet')).toBe('alerted');
  expect(outbox()[0]!.text).toContain('none since it started at 2026-10-15T19:40:00Z');
});

test.each(['yesterday', '', 'NaN', '2026-13-45T99:99:99Z', '2026-10-16T09:00:00Z'])('a last tick of %p counts as stale and alerts', (raw) => {
  setMeta(db, LAST_TICK, raw);
  expect(watcherState(db)).toMatchObject({ stale: true, minutes: null });
  expect(watcherAlert(db, 'hq-fleet')).toBe('alerted');
  expect(outbox()[0]!.text).toContain('last tick time is unreadable');
});

test('each tick samples the Claude usage cache once per new reading', async () => {
  mkdirSync(`${dir}/.cache/z-capacity`, { recursive: true });
  writeFileSync(`${dir}/.cache/z-capacity/claude-usage.json`, JSON.stringify({ used: 40, windows: { fiveHour: 12, sevenDay: 40 } }));
  await watchTick(db, deps());
  await watchTick(db, deps());
  expect(db.query('SELECT account, five_hour, seven_day FROM usage_samples').all()).toEqual([{ account: 'active', five_hour: 12, seven_day: 40 }]);
  expect(logs.filter((l) => l.includes('Claude usage: new reading stored'))).toHaveLength(1);
});

test('a tick without a usage cache stores nothing and logs nothing about it', async () => {
  expect(await watchTick(db, deps())).toBe(true);
  expect(db.query('SELECT COUNT(*) AS n FROM usage_samples').get()).toEqual({ n: 0 });
  expect(logs.some((l) => l.includes('usage'))).toBe(false);
});

test('at 18:00 Sydney the watcher sends the goals check-in once, after a fresh goals sync', async () => {
  at('2026-10-16T07:00:00Z'); // 18:00 Sydney
  setMeta(db, 'goals_synced_at', '2026-10-16T06:50:00Z');
  setMeta(db, 'goals_ok_at', '2026-10-16T06:50:00Z');
  setMeta(db, 'kinds_synced_at', '2026-10-16T06:50:00Z');
  setMeta(db, 'kinds_ok_at', '2026-10-16T06:50:00Z');
  setMeta(db, 'linear_synced_at', '2026-10-16T06:50:00Z');
  await watchTick(db, deps());
  await watchTick(db, deps());
  expect(outbox().filter((o) => o.topic === 'job:goals-daily:2026-10-16')).toHaveLength(1);
  expect(logs.filter((l) => l.includes('goals check-in due'))).toHaveLength(1);
});

test('at Monday 17:00 Sydney the watcher sends the goals weekly once, after a fresh goals sync', async () => {
  at('2026-10-19T06:00:00Z'); // Mon 19 Oct 17:00 Sydney
  for (const k of ['goals_synced_at', 'goals_ok_at', 'kinds_synced_at', 'kinds_ok_at', 'linear_synced_at']) setMeta(db, k, '2026-10-19T05:50:00Z');
  await watchTick(db, deps());
  await watchTick(db, deps());
  expect(outbox().filter((o) => o.topic === 'job:goals-weekly:2026-10-19')).toHaveLength(1);
  expect(logs.filter((l) => l.includes('goals weekly due'))).toHaveLength(1);
});

test('a tick reads one usage row per account file', async () => {
  const d = `${dir}/.cache/z-capacity/claude-usage`;
  mkdirSync(d, { recursive: true });
  for (const k of ['aaaaaaaaaaaa', 'bbbbbbbbbbbb']) writeFileSync(`${d}/${k}.json`, JSON.stringify({ account: k, windows: { fiveHour: 1, sevenDay: 2 } }));
  await watchTick(db, deps());
  expect(db.query('SELECT COUNT(*) AS n FROM usage_samples').get()).toEqual({ n: 2 });
});

// A runner for the goals sync: no repos or runs on GitHub, an apply that succeeded for every stored deploy-prod run.
function goalsRunner(): Runner {
  return async (cmd, o) => {
    if (cmd[0] !== 'gh') return capacity(cmd, o);
    if (cmd[1] === 'repo') return { code: 0, stdout: '[]', stderr: '' };
    if (cmd.some((c) => c.includes('/jobs?'))) return { code: 0, stdout: JSON.stringify({ total_count: 1, jobs: [{ name: 'apply', conclusion: 'success', steps: [] }] }), stderr: '' };
    return { code: 0, stdout: JSON.stringify([{ total_count: 0, incomplete_results: false, items: [] }]), stderr: '' };
  };
}

function storeDeployRuns(n: number) {
  const ins = db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, ?, ?, 'push', 'completed', 'success', 1, ?, ?, ?)`);
  for (let i = 0; i < n; i++) {
    const t = `2026-10-14T00:${String(i % 60).padStart(2, '0')}:00Z`;
    ins.run(7000 + i, DEPLOY.repo, DEPLOY.path, t, t, t);
  }
}

test('the watcher holds goals_ok_at while the cap leaves deploy-prod runs unclassified, and sets it once none are left', async () => {
  const old = '2026-10-15T10:00:00Z';
  setMeta(db, 'goals_synced_at', old); // stale: the sync is due
  setMeta(db, 'goals_ok_at', old);
  storeDeployRuns(61); // the cap is 60 a sync
  await watchTick(db, deps({}, goalsRunner()));
  expect(getMeta(db, 'goals_synced_at')).toBe('2026-10-15T20:00:00Z'); // the sync ran
  expect(getMeta(db, 'goals_ok_at')).toBe(old); // one run is still unclassified
  setMeta(db, 'goals_synced_at', old);
  await watchTick(db, deps({}, goalsRunner()));
  expect(getMeta(db, 'goals_ok_at')).toBe('2026-10-15T20:00:00Z'); // none left
});

test('it holds goals_ok_at while the cap leaves repo-days unfetched', async () => {
  const old = '2026-10-15T10:00:00Z';
  setMeta(db, 'goals_synced_at', old);
  setMeta(db, 'goals_ok_at', old);
  const repos = JSON.stringify(IN_SCOPE.map((name) => ({ name, isArchived: false })));
  const noRuns = JSON.stringify({ total_count: 0, workflow_runs: [] });
  const sync = goalsRunner();

  await watchTick(
    db,
    deps({}, (cmd, opts) => {
      if (cmd[0] === 'gh' && cmd[1] === 'repo') {
        return Promise.resolve({ code: 0, stdout: repos, stderr: '' });
      }
      if (cmd[0] === 'gh' && cmd.some((part) => part.includes('/actions/runs?'))) {
        return Promise.resolve({ code: 0, stdout: noRuns, stderr: '' });
      }
      return sync(cmd, opts);
    }),
  );

  expect(getMeta(db, 'goals_synced_at')).toBe('2026-10-15T20:00:00Z');
  expect(getMeta(db, 'goals_ok_at')).toBe(old);
});

test('the refusals step logs a count when it finds some, stays quiet on none, and never fails the tick', async () => {
  expect(await watchTick(db, deps({ refusals: async () => 3 }))).toBe(true);
  expect(logs.some((l) => l.includes('found 3 refusals'))).toBe(true);
  logs.length = 0;
  expect(await watchTick(db, deps({ refusals: async () => 0 }))).toBe(true);
  expect(logs.some((l) => l.includes('found'))).toBe(false);
  expect(await watchTick(db, deps({ refusals: async () => Promise.reject(new Error('disk gone')) }))).toBe(true);
  expect(logs.some((l) => l.includes('refusals scan failed: disk gone'))).toBe(true);
  expect(await watchTick(db, deps({ refusals: () => new Promise<never>(() => {}) }))).toBe(true); // a hung scan costs the step
  expect(logs.some((l) => l.includes('refusals did not finish'))).toBe(true);
});

test('the capacity step logs opened and cleared counts, stays quiet on none, and never fails the tick', async () => {
  expect(await watchTick(db, deps({ capacity: async () => ({ opened: ['a', 'b'], cleared: [] }) }))).toBe(true);
  expect(logs.some((l) => l.includes('capacity: 2 opened, 0 cleared'))).toBe(true);
  logs.length = 0;
  expect(await watchTick(db, deps({ capacity: async () => ({ opened: [], cleared: [] }) }))).toBe(true);
  expect(logs.some((l) => l.includes('capacity:'))).toBe(false);
  expect(await watchTick(db, deps({ capacity: async () => Promise.reject(new Error('impz gone')) }))).toBe(true);
  expect(logs.some((l) => l.includes('capacity failed: impz gone'))).toBe(true);
  expect(await watchTick(db, deps({ capacity: () => new Promise<never>(() => {}) }))).toBe(true);
  expect(logs.some((l) => l.includes('capacity failed: capacity sample did not finish'))).toBe(true);
});

test('a tick drops an unblock item once GitHub reports its subject PR merged, and tells nobody', async () => {
  addUnblock(db, { id: 'review-kettle-4', task: 'Review kettle#4 and say lgtm', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' });
  db.query('UPDATE unblocks SET item = ? WHERE id = ?').run(JSON.stringify({ details: [], unblocks: [], links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] }), 'review-kettle-4');

  const ok = await watchTick(db, deps({}, makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' }, fallback: capacity })));

  expect(ok).toBe(true);
  expect(getUnblock(db, 'review-kettle-4')?.state).toBe('dropped');
  expect(logs.some((line) => line.includes('unblock conditions: dropped review-kettle-4'))).toBe(true);
  expect(outbox().filter((m) => m.text.includes('kettle'))).toStrictEqual([]);
});

test('it marks a run PR merged from GitHub and attaches an opened PR to its run in one tick', async () => {
  addRun(db, { issue: 'GEO-9821', title: 'Invented kettle work', place: 'none', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'kettle-bot' });
  addPr(db, 'GEO-9821', 'kettle#4', 'kettle-bot');
  addRun(db, { issue: 'GEO-9822', title: 'Invented teapot work', place: 'none', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'kettle-bot' });
  const calls: string[] = [];
  const gh = buildStubGitHubFactsRunner({
    views: { 'kettle#4': JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-15T19:00:00Z', mergeCommit: { oid: 'a'.repeat(40) } }) },
    search: JSON.stringify([{ number: 9, repository: { name: 'hq' }, author: { login: 'zgeoff' }, body: 'Contributes to GEO-9822' }]),
    calls,
    fallback: capacity,
  });

  const ok = await watchTick(db, deps({}, gh));

  expect(ok).toBe(true);
  expect(calls.some((call) => call.startsWith('gh search'))).toBe(true);
  expect(db.query("SELECT state, merged_at FROM run_prs WHERE ref = 'kettle#4'").get()).toStrictEqual({ state: 'merged', merged_at: '2026-10-15T19:00:00Z' });
  expect(db.query("SELECT issue FROM run_prs WHERE ref = 'hq#9'").get()).toStrictEqual({ issue: 'GEO-9822' });
  expect(logs.some((line) => line.includes('run PRs: closed kettle#4'))).toBe(true);
  expect(logs.some((line) => line.includes('run PRs: attached hq#9 to GEO-9822'))).toBe(true);
});

test('it logs every run PR GitHub could not answer for, one line each', async () => {
  addRun(db, { issue: 'GEO-9821', title: 'Invented kettle work', place: 'none', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'kettle-bot' });
  for (const ref of ['kettle#4', 'kettle#5', 'kettle#6']) {
    addPr(db, 'GEO-9821', ref, 'kettle-bot');
  }
  const gh = buildStubGitHubFactsRunner({ views: {}, search: '[]', fallback: capacity });

  await watchTick(db, deps({}, gh));

  expect(logs.filter((line) => line.includes('run PRs: kettle#')).map((line) => line.replace(/^\S+ /u, ''))).toStrictEqual([
    "run PRs: kettle#4: can't read it (gh exit 1): invented: no such PR",
    "run PRs: kettle#5: can't read it (gh exit 1): invented: no such PR",
    "run PRs: kettle#6: can't read it (gh exit 1): invented: no such PR",
  ]);
});

function readAlertStatuses(): string[] {
  return (db.query(`SELECT status FROM outbox WHERE topic = 'watcher-stale'`).all() as { status: string }[]).map((r) => r.status);
}

test('an alert that failed while atc was down is sent once atc is back', async () => {
  process.env['HQ_ATC_SOCKET'] = `${dir}/nobody-home.sock`;
  delete process.env['HQ_NOTIFY'];
  setMeta(db, LAST_TICK, '2026-10-15T20:00:00Z');
  at('2026-10-15T20:20:00Z');
  expect(watcherAlert(db, 'hq-fleet')).toBe('alerted');
  await sendStaleWatcherAlerts(db);
  expect(readAlertStatuses()).toEqual(['failed']);

  const atc = fakeAtc(dir);
  await sendStaleWatcherAlerts(db);
  await sendStaleWatcherAlerts(db);
  atc.stop();

  expect(readAlertStatuses()).toEqual(['sent']);
  expect(atc.sent).toEqual([expect.objectContaining({ session: 'id-stu', text: expect.stringContaining('hq watcher: no completed tick for 20 min') })]);
});

test('an alert is not sent while HQ_NOTIFY is off', async () => {
  const atc = fakeAtc(dir);
  setMeta(db, LAST_TICK, '2026-10-15T20:00:00Z');
  at('2026-10-15T20:20:00Z');
  expect(watcherAlert(db, 'hq-fleet')).toBe('alerted');
  process.env['HQ_NOTIFY'] = 'off';
  await sendStaleWatcherAlerts(db);
  atc.stop();

  expect(readAlertStatuses()).toEqual(['pending']);
  expect(atc.sent).toEqual([]);
});

test('fleet ensure sends a stale-watcher alert left failed by an earlier run, once', async () => {
  process.env['HQ_ATC_SOCKET'] = `${dir}/nobody-home.sock`;
  delete process.env['HQ_NOTIFY'];
  setMeta(db, LAST_TICK, '2026-10-15T20:00:00Z');
  at('2026-10-15T20:20:00Z');
  expect(watcherAlert(db, 'hq-fleet')).toBe('alerted');
  await sendStaleWatcherAlerts(db);
  expect(readAlertStatuses()).toEqual(['failed']);

  const atc = fakeAtc(dir);
  await main(['fleet', 'ensure', '--dry-run']);
  expect(atc.sent).toEqual([]);
  await main(['fleet', 'ensure']);
  await main(['fleet', 'ensure']);
  atc.stop();

  expect(atc.sent.filter((m) => m.text.startsWith('hq watcher: no completed tick'))).toHaveLength(1);
  expect(readAlertStatuses()).toEqual(['sent']);
});

test('fleet ensure with atc up sends a new stale-watcher alert once, not twice', async () => {
  const atc = fakeAtc(dir);
  delete process.env['HQ_NOTIFY'];
  setMeta(db, LAST_TICK, '2026-10-15T20:00:00Z');
  at('2026-10-15T20:20:00Z');
  await main(['fleet', 'ensure']);
  atc.stop();

  expect(atc.sent.filter((m) => m.text.startsWith('hq watcher: no completed tick'))).toHaveLength(1);
  expect(readAlertStatuses()).toEqual(['sent']);
});
