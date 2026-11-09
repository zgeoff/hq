import { readOutboxRows } from '../src/outbox/read-outbox-rows.ts';
import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
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
import { applyUnblockItem } from '../src/apply-unblock-item.ts';
import { parseItemInput } from '../src/parse-item-input.ts';
import { getUnblock } from '../src/unblock/get-unblock.ts';
import { at, fakeAtc, freshDb } from './helpers.ts';
import { buildStubGitHubFactsRunner } from './build-stub-github-facts-runner.ts';
import { makePRStateGh } from './make-pr-state-gh.ts';
import { IN_SCOPE } from '../src/scope/in-scope.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';

const capacity: Runner = async () => ({ code: 0, stdout: JSON.stringify({ imp: { freeMib: 0, room: false }, providers: { claude: { room: false, unattended: true, target: 'imp' } } }), stderr: '' });

function setupTest() {
  const base = freshDb();
  const db = base.db;
  onTestFinished(base.cleanup);
  updateEnv('HOME', base.dir);
  updateEnv('XDG_CACHE_HOME', undefined);
  updateEnv('HQ_NOTIFY', 'off');
  updateEnv('HQ_ATC_SOCKET', undefined);
  at('2026-10-15T20:00:00Z');
  const logs: string[] = [];

  return {
    db,
    directory: base.dir,
    logs,
    seed: buildSeeder(base),
    deps: (over: Partial<WatchDeps['steps']> = {}, run: Runner = capacity): WatchDeps => ({
      me: 'hq-lanes',
      run,
      log: (line) => logs.push(line),
      stepMs: 200,
      steps: { runs: async () => {}, weekly: () => Promise.resolve(false), health: () => Promise.resolve({ opened: [], cleared: [] }), ...over },
    }),
    readAlertStatuses: () =>
      readOutboxRows(db)
        .filter((row) => row.topic === 'watcher-stale')
        .map((row) => row.status),
  };
}

test('a completed tick records its time', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  expect(getMeta(ctx.db, LAST_TICK)).toBeNull();
  const ticked = await watchTick(ctx.db, ctx.deps());
  expect(ticked).toBe(true);
  expect(getMeta(ctx.db, LAST_TICK)).toBe('2026-10-15T20:00:00Z');
  expect(ctx.logs.at(-1)).toContain('slots=');
});

test('a tick queues the morning call ready and the unblock list changed for the owner', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  addAsk(ctx.db, { kind: 'call', id: 'geo-1-paint', title: 'Paint the shed', question: 'Green or grey?', body: 'Green or grey? Recommendation: green.', issues: ['GEO-1'], forSession: 'z-delivery', actor: 'z-refine' });
  addUnblock(ctx.db, { id: 'kettle', task: 'Try the new kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });

  const done = await watchTick(ctx.db, ctx.deps());
  const sent = ctx.db.query("SELECT target, text, topic FROM outbox WHERE topic IN ('call-ready-morning', 'unblock-changed') ORDER BY topic").all();

  expect(done).toBe(true);
  expect(sent).toStrictEqual([
    { target: owner(), text: 'call ready', topic: 'call-ready-morning' },
    { target: owner(), text: 'unblock list changed', topic: 'unblock-changed' },
  ]);
});

test('a hanging step costs that step, not the loop; the tick still completes', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const hang = () => new Promise<never>(() => {});
  const t0 = Date.now();
  const ticked = await watchTick(ctx.db, ctx.deps({ weekly: hang, health: hang }));
  expect(ticked).toBe(true);
  expect(Date.now() - t0).toBeLessThan(2_000);
  expect(ctx.logs.some((line) => line.includes('weekly stats failed: weekly stats did not finish'))).toBe(true);
  expect(ctx.logs.some((line) => line.includes('health failed: health did not finish'))).toBe(true);
  expect(getMeta(ctx.db, LAST_TICK)).not.toBeNull();
});

test('a hanging capacity read or sweep fails the tick, which then records no time', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const hung: Runner = () => new Promise(() => {});
  const capacityTick = await watchTick(ctx.db, ctx.deps({}, hung));
  expect(capacityTick).toBe(false);
  expect(ctx.logs.at(-1)).toContain('tick failed: capacity did not finish');
  const sweepTick = await watchTick(ctx.db, ctx.deps({ runs: () => new Promise(() => {}) }));
  expect(sweepTick).toBe(false);
  expect(ctx.logs.at(-1)).toContain('tick failed: notes and sweep did not finish');
  expect(getMeta(ctx.db, LAST_TICK)).toBeNull();
});

test('withDeadline passes a result through and clears its timer', async () => {
  expect(await withDeadline(Promise.resolve(3), 50, 'x')).toBe(3);
  await expect(withDeadline(Promise.reject(new Error('inner')), 50, 'x')).rejects.toThrow('inner');
});

test('a watcher with no tick for 15 min alerts z-stu once, and once more when it recovers', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  expect(watcherState(ctx.db)).toMatchObject({ since: null, stale: false });
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBeNull();
  await watchTick(ctx.db, ctx.deps());
  at('2026-10-15T20:14:00Z');
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBeNull();
  at('2026-10-15T20:15:00Z');
  expect(watcherState(ctx.db)).toMatchObject({ stale: true, minutes: 15 });
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBe('alerted');
  at('2026-10-15T20:20:00Z');
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBeNull();
  expect(readOutboxRows(ctx.db).map((row) => ({ target: row.target, topic: row.topic }))).toStrictEqual([{ target: 'z-stu', topic: 'watcher-stale' }]);
  expect(readOutboxRows(ctx.db)[0]?.text).toContain('no completed tick for 15 min (last 2026-10-15T20:00:00Z)');
  await watchTick(ctx.db, ctx.deps());
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBe('recovered');
  expect(readOutboxRows(ctx.db).at(-1)?.target).toBe('z-stu');
  expect(readOutboxRows(ctx.db).at(-1)?.text).toContain('ticking again');
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBeNull();
});

test('a watcher that started but never completed a tick counts from its start', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'watcher_started_at', '2026-10-15T19:40:00Z');
  expect(watcherState(ctx.db)).toMatchObject({ lastTick: null, stale: true, minutes: 20 });
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBe('alerted');
  expect(readOutboxRows(ctx.db)[0]?.text).toContain('none since it started at 2026-10-15T19:40:00Z');
});

test.each(['yesterday', '', 'NaN', '2026-13-45T99:99:99Z', '2026-10-16T09:00:00Z'])('a last tick of %p counts as stale and alerts', (raw) => {
  const ctx = setupTest();
  setMeta(ctx.db, LAST_TICK, raw);
  expect(watcherState(ctx.db)).toMatchObject({ stale: true, minutes: null });
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBe('alerted');
  expect(readOutboxRows(ctx.db)[0]?.text).toContain('last tick time is unreadable');
});

test('each tick samples the Claude usage cache once per new reading', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  mkdirSync(`${ctx.directory}/.cache/z-capacity`, { recursive: true });
  writeFileSync(`${ctx.directory}/.cache/z-capacity/claude-usage.json`, JSON.stringify({ used: 40, windows: { fiveHour: 12, sevenDay: 40 } }));
  await watchTick(ctx.db, ctx.deps());
  await watchTick(ctx.db, ctx.deps());
  expect(ctx.db.query('SELECT account, five_hour, seven_day FROM usage_samples').all()).toStrictEqual([{ account: 'active', five_hour: 12, seven_day: 40 }]);
  expect(ctx.logs.filter((line) => line.includes('Claude usage: new reading stored'))).toHaveLength(1);
});

test('a tick without a usage cache stores nothing and logs nothing about it', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const ticked = await watchTick(ctx.db, ctx.deps());
  expect(ticked).toBe(true);
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM usage_samples').get()).toStrictEqual({ count: 0 });
  expect(ctx.logs.some((line) => line.includes('usage'))).toBe(false);
});

test('at 18:00 Sydney the watcher sends the goals check-in once, after a fresh goals sync', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  at('2026-10-16T07:00:00Z');
  setMeta(ctx.db, 'goals_synced_at', '2026-10-16T06:50:00Z');
  setMeta(ctx.db, 'goals_ok_at', '2026-10-16T06:50:00Z');
  setMeta(ctx.db, 'kinds_synced_at', '2026-10-16T06:50:00Z');
  setMeta(ctx.db, 'kinds_ok_at', '2026-10-16T06:50:00Z');
  setMeta(ctx.db, 'linear_synced_at', '2026-10-16T06:50:00Z');
  await watchTick(ctx.db, ctx.deps());
  await watchTick(ctx.db, ctx.deps());
  expect(readOutboxRows(ctx.db).filter((row) => row.topic === 'job:goals-daily:2026-10-16')).toHaveLength(1);
  expect(ctx.logs.filter((line) => line.includes('goals check-in due'))).toHaveLength(1);
});

test('at Monday 17:00 Sydney the watcher sends the goals weekly once, after a fresh goals sync', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  at('2026-10-19T06:00:00Z');
  for (const key of ['goals_synced_at', 'goals_ok_at', 'kinds_synced_at', 'kinds_ok_at', 'linear_synced_at']) {
    setMeta(ctx.db, key, '2026-10-19T05:50:00Z');
  }
  await watchTick(ctx.db, ctx.deps());
  await watchTick(ctx.db, ctx.deps());
  expect(readOutboxRows(ctx.db).filter((row) => row.topic === 'job:goals-weekly:2026-10-19')).toHaveLength(1);
  expect(ctx.logs.filter((line) => line.includes('goals weekly due'))).toHaveLength(1);
});

test('a tick reads one usage row per account file', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const usageDirectory = `${ctx.directory}/.cache/z-capacity/claude-usage`;
  mkdirSync(usageDirectory, { recursive: true });
  for (const account of ['aaaaaaaaaaaa', 'bbbbbbbbbbbb']) {
    writeFileSync(`${usageDirectory}/${account}.json`, JSON.stringify({ account, windows: { fiveHour: 1, sevenDay: 2 } }));
  }
  await watchTick(ctx.db, ctx.deps());
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM usage_samples').get()).toStrictEqual({ count: 2 });
});

function goalsRunner(): Runner {
  return async (cmd, o) => {
    if (cmd[0] !== 'gh') return capacity(cmd, o);
    if (cmd[1] === 'repo') return { code: 0, stdout: '[]', stderr: '' };
    if (cmd.some((c) => c.includes('/jobs?'))) return { code: 0, stdout: JSON.stringify({ total_count: 1, jobs: [{ name: 'apply', conclusion: 'success', steps: [] }] }), stderr: '' };
    return { code: 0, stdout: JSON.stringify([{ total_count: 0, incomplete_results: false, items: [] }]), stderr: '' };
  };
}

test('the watcher holds goals_ok_at while the cap leaves deploy-prod runs unclassified, and sets it once none are left', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const old = '2026-10-15T10:00:00Z';
  setMeta(ctx.db, 'goals_synced_at', old);
  setMeta(ctx.db, 'goals_ok_at', old);
  for (let index = 0; index < 61; index++) {
    const created = `2026-10-14T00:${String(index % 60).padStart(2, '0')}:00Z`;
    ctx.seed.ciRun({ id: 7000 + index, repo: DEPLOY.repo, path: DEPLOY.path, created_at: created, started_at: created, updated_at: created });
  }
  await watchTick(ctx.db, ctx.deps({}, goalsRunner()));
  expect(getMeta(ctx.db, 'goals_synced_at')).toBe('2026-10-15T20:00:00Z');
  expect(getMeta(ctx.db, 'goals_ok_at')).toBe(old);
  setMeta(ctx.db, 'goals_synced_at', old);
  await watchTick(ctx.db, ctx.deps({}, goalsRunner()));
  expect(getMeta(ctx.db, 'goals_ok_at')).toBe('2026-10-15T20:00:00Z');
});

test('it holds goals_ok_at while the cap leaves repo-days unfetched', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const old = '2026-10-15T10:00:00Z';
  setMeta(ctx.db, 'goals_synced_at', old);
  setMeta(ctx.db, 'goals_ok_at', old);
  const repos = JSON.stringify(IN_SCOPE.map((name) => ({ name, isArchived: false })));
  const noRuns = JSON.stringify({ total_count: 0, workflow_runs: [] });
  const sync = goalsRunner();

  await watchTick(
    ctx.db,
    ctx.deps({}, (cmd, opts) => {
      if (cmd[0] === 'gh' && cmd[1] === 'repo') {
        return Promise.resolve({ code: 0, stdout: repos, stderr: '' });
      }
      if (cmd[0] === 'gh' && cmd.some((part) => part.includes('/actions/runs?'))) {
        return Promise.resolve({ code: 0, stdout: noRuns, stderr: '' });
      }
      return sync(cmd, opts);
    }),
  );

  expect(getMeta(ctx.db, 'goals_synced_at')).toBe('2026-10-15T20:00:00Z');
  expect(getMeta(ctx.db, 'goals_ok_at')).toBe(old);
});

test('the refusals step logs a count when it finds some, stays quiet on none, and never fails the tick', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const found = await watchTick(ctx.db, ctx.deps({ refusals: () => Promise.resolve(3) }));
  expect(found).toBe(true);
  expect(ctx.logs.some((line) => line.includes('found 3 refusals'))).toBe(true);
  ctx.logs.length = 0;
  const none = await watchTick(ctx.db, ctx.deps({ refusals: () => Promise.resolve(0) }));
  expect(none).toBe(true);
  expect(ctx.logs.some((line) => line.includes('found'))).toBe(false);
  const failed = await watchTick(ctx.db, ctx.deps({ refusals: () => Promise.reject(new Error('disk gone')) }));
  expect(failed).toBe(true);
  expect(ctx.logs.some((line) => line.includes('refusals scan failed: disk gone'))).toBe(true);
  const hung = await watchTick(ctx.db, ctx.deps({ refusals: () => new Promise<never>(() => {}) }));
  expect(hung).toBe(true);
  expect(ctx.logs.some((line) => line.includes('refusals did not finish'))).toBe(true);
});

test('the capacity step logs opened and cleared counts, stays quiet on none, and never fails the tick', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const opened = await watchTick(ctx.db, ctx.deps({ capacity: () => Promise.resolve({ opened: ['a', 'b'], cleared: [] }) }));
  expect(opened).toBe(true);
  expect(ctx.logs.some((line) => line.includes('capacity: 2 opened, 0 cleared'))).toBe(true);
  ctx.logs.length = 0;
  const none = await watchTick(ctx.db, ctx.deps({ capacity: () => Promise.resolve({ opened: [], cleared: [] }) }));
  expect(none).toBe(true);
  expect(ctx.logs.some((line) => line.includes('capacity:'))).toBe(false);
  const failed = await watchTick(ctx.db, ctx.deps({ capacity: () => Promise.reject(new Error('impz gone')) }));
  expect(failed).toBe(true);
  expect(ctx.logs.some((line) => line.includes('capacity failed: impz gone'))).toBe(true);
  const hung = await watchTick(ctx.db, ctx.deps({ capacity: () => new Promise<never>(() => {}) }));
  expect(hung).toBe(true);
  expect(ctx.logs.some((line) => line.includes('capacity failed: capacity sample did not finish'))).toBe(true);
});

test('a tick drops an unblock item once GitHub reports its subject PR merged, and tells nobody', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  applyUnblockItem(
    ctx.db,
    { id: 'review-kettle-4', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' },
    parseItemInput('unblock', JSON.stringify({ title: 'Review kettle#4', question: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] })),
  );

  const ok = await watchTick(ctx.db, ctx.deps({}, makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' }, fallback: capacity })));

  expect(ok).toBe(true);
  expect(getUnblock(ctx.db, 'review-kettle-4')?.state).toBe('dropped');
  expect(ctx.logs.some((line) => line.includes('unblock conditions: dropped review-kettle-4'))).toBe(true);
  expect(readOutboxRows(ctx.db).filter((row) => row.text.includes('kettle'))).toStrictEqual([]);
});

test('it marks a run PR merged from GitHub and attaches an opened PR to its run in one tick', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  addRun(ctx.db, { issue: 'GEO-9821', title: 'Invented kettle work', place: 'none', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9821', 'kettle#4', 'kettle-bot');
  addRun(ctx.db, { issue: 'GEO-9822', title: 'Invented teapot work', place: 'none', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'kettle-bot' });
  const calls: string[] = [];
  const gh = buildStubGitHubFactsRunner({
    views: { 'kettle#4': JSON.stringify({ state: 'MERGED', mergedAt: '2026-10-15T19:00:00Z', mergeCommit: { oid: 'a'.repeat(40) } }) },
    search: JSON.stringify([{ number: 9, repository: { name: 'hq' }, author: { login: 'zgeoff' }, body: 'Contributes to GEO-9822' }]),
    calls,
    fallback: capacity,
  });

  const ok = await watchTick(ctx.db, ctx.deps({}, gh));

  expect(ok).toBe(true);
  expect(calls.some((call) => call.startsWith('gh search'))).toBe(true);
  expect(ctx.db.query("SELECT state, merged_at FROM run_prs WHERE ref = 'kettle#4'").get()).toStrictEqual({ state: 'merged', merged_at: '2026-10-15T19:00:00Z' });
  expect(ctx.db.query("SELECT issue FROM run_prs WHERE ref = 'hq#9'").get()).toStrictEqual({ issue: 'GEO-9822' });
  expect(ctx.logs.some((line) => line.includes('run PRs: closed kettle#4'))).toBe(true);
  expect(ctx.logs.some((line) => line.includes('run PRs: attached hq#9 to GEO-9822'))).toBe(true);
});

test('it logs every run PR GitHub could not answer for, one line each', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  addRun(ctx.db, { issue: 'GEO-9821', title: 'Invented kettle work', place: 'none', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'kettle-bot' });
  for (const ref of ['kettle#4', 'kettle#5', 'kettle#6']) {
    addPr(ctx.db, 'GEO-9821', ref, 'kettle-bot');
  }
  const gh = buildStubGitHubFactsRunner({ views: {}, search: '[]', fallback: capacity });

  await watchTick(ctx.db, ctx.deps({}, gh));

  expect(ctx.logs.filter((line) => line.includes('run PRs: kettle#')).map((line) => line.replace(/^\S+ /u, ''))).toStrictEqual([
    "run PRs: kettle#4: can't read it (gh exit 1): invented: no such PR",
    "run PRs: kettle#5: can't read it (gh exit 1): invented: no such PR",
    "run PRs: kettle#6: can't read it (gh exit 1): invented: no such PR",
  ]);
});

test('an alert that failed while atc was down is sent once atc is back', async () => {
  const ctx = setupTest();
  updateEnv('HQ_ATC_SOCKET', `${ctx.directory}/nobody-home.sock`);
  updateEnv('HQ_NOTIFY', undefined);
  setMeta(ctx.db, LAST_TICK, '2026-10-15T20:00:00Z');
  at('2026-10-15T20:20:00Z');
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBe('alerted');
  await sendStaleWatcherAlerts(ctx.db);
  expect(ctx.readAlertStatuses()).toStrictEqual(['failed']);

  const atc = fakeAtc(ctx.directory);
  await sendStaleWatcherAlerts(ctx.db);
  await sendStaleWatcherAlerts(ctx.db);
  atc.stop();

  expect(ctx.readAlertStatuses()).toStrictEqual(['sent']);
  expect(atc.sent).toStrictEqual([expect.objectContaining({ session: 'id-stu', text: expect.stringContaining('hq watcher: no completed tick for 20 min') })]);
});

test('an alert is not sent while HQ_NOTIFY is off', async () => {
  const ctx = setupTest();
  const atc = fakeAtc(ctx.directory);
  setMeta(ctx.db, LAST_TICK, '2026-10-15T20:00:00Z');
  at('2026-10-15T20:20:00Z');
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBe('alerted');
  updateEnv('HQ_NOTIFY', 'off');
  await sendStaleWatcherAlerts(ctx.db);
  atc.stop();

  expect(ctx.readAlertStatuses()).toStrictEqual(['pending']);
  expect(atc.sent).toStrictEqual([]);
});

test('fleet ensure sends a stale-watcher alert left failed by an earlier run, once', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  updateEnv('HQ_ATC_SOCKET', `${ctx.directory}/nobody-home.sock`);
  updateEnv('HQ_NOTIFY', undefined);
  setMeta(ctx.db, LAST_TICK, '2026-10-15T20:00:00Z');
  at('2026-10-15T20:20:00Z');
  expect(watcherAlert(ctx.db, 'hq-fleet')).toBe('alerted');
  await sendStaleWatcherAlerts(ctx.db);
  expect(ctx.readAlertStatuses()).toStrictEqual(['failed']);

  const atc = fakeAtc(ctx.directory);
  await main(['fleet', 'ensure', '--dry-run']);
  expect(atc.sent).toStrictEqual([]);
  await main(['fleet', 'ensure']);
  await main(['fleet', 'ensure']);
  atc.stop();

  expect(atc.sent.filter((message) => message.text.startsWith('hq watcher: no completed tick'))).toHaveLength(1);
  expect(ctx.readAlertStatuses()).toStrictEqual(['sent']);
});

test('fleet ensure with atc up sends a new stale-watcher alert once, not twice', async () => {
  const ctx = setupTest();
  for (const key of ['kinds_synced_at', 'goals_synced_at', 'goals_ok_at', 'kinds_ok_at', 'linear_synced_at', 'lanes_ready_linear_at']) {
    ctx.seed.meta({ key, value: new Date().toISOString() });
  }
  const atc = fakeAtc(ctx.directory);
  updateEnv('HQ_NOTIFY', undefined);
  setMeta(ctx.db, LAST_TICK, '2026-10-15T20:00:00Z');
  at('2026-10-15T20:20:00Z');
  await main(['fleet', 'ensure']);
  atc.stop();

  expect(atc.sent.filter((message) => message.text.startsWith('hq watcher: no completed tick'))).toHaveLength(1);
  expect(ctx.readAlertStatuses()).toStrictEqual(['sent']);
});
