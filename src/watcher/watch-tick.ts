import type { Database } from 'bun:sqlite';
import { queueReminder } from '../asks/queue-reminder.ts';
import { runCallReadyMorningTick } from '../asks/run-call-ready-morning-tick.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { runAllTreeSyncs } from '../defs/run-all-tree-syncs.ts';
import { HqError } from '../errors.ts';
import { clearGhAuth } from '../ghauth/clear-gh-auth.ts';
import { isGhAuthFailure } from '../ghauth/is-gh-auth-failure.ts';
import { noteGhAuth } from '../ghauth/note-gh-auth.ts';
import { goalsDailyTick } from '../goals/daily/goals-daily-tick.ts';
import { sendThroughputAlerts } from '../goals/throughput/send-throughput-alerts.ts';
import { refreshActionsSpend } from '../goals/refresh-actions-spend.ts';
import { sampleUsage } from '../goals/sample-usage.ts';
import { syncGoals } from '../goals/sync-goals.ts';
import { goalsWeeklyTick } from '../goals/weekly/goals-weekly-tick.ts';
import { syncKinds } from '../kinds/sync-kinds.ts';
import { syncLinear } from '../kinds/sync-linear.ts';
import { syncRunIssues } from '../linear/sync-run-issues.ts';
import { dropCanceledRuns } from '../runs/drop-canceled-runs.ts';
import { readCapacity } from '../lanes/read-capacity.ts';
import { readPacingLanes } from '../lanes/read-pacing-lanes.ts';
import { tick } from '../lanes/tick.ts';
import { runLinearReadyTick } from '../run-linear-ready-tick.ts';
import { makeAuditedLinearCaller } from '../linear/make-audited-linear-caller.ts';
import { morningTick } from '../morning/morning-tick.ts';
import { flush } from '../outbox/flush.ts';
import { takeQueued } from '../outbox/take-queued.ts';
import { owner } from '../owner.ts';
import { CHECKED_AT } from '../releases/checked-at.ts';
import { isShipPassDue as dueForShipPass } from '../releases/is-ship-pass-due.ts';
import { shipRuns } from '../releases/ship-runs.ts';
import { runUnblockChangedTick } from '../unblock/run-unblock-changed-tick.ts';
import { runGitHubFactsTick } from '../run-github-facts-tick.ts';
import { runUnblockConditionsTick } from '../run-unblock-conditions-tick.ts';
import { runWeeklyAuditTick } from '../run-weekly-audit-tick.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import { LAST_TICK } from './last-tick.ts';
import { STEP_MS } from './step-ms.ts';
import type { WatchDeps } from './types.ts';
import { withDeadline } from './with-deadline.ts';

// The goals data looks back this far: the weekly's two weeks plus today.
const LOOKBACK_DAYS = 15;

const msg = (e: unknown) => String((e as Error).message ?? e);

// One pass. True when the tick completed: the lanes reading, the sweep and the send all ran.
export async function watchTick(db: Database, d: WatchDeps): Promise<boolean> {
  const ms = d.stepMs ?? STEP_MS;
  const unsettled = readUnsettled(d);
  const step = <T,>(what: string, start: (signal: AbortSignal) => Promise<T>) => {
    if (unsettled.has(what)) {
      return Promise.reject(new HqError('busy', `${what} from an earlier pass is still running`));
    }
    const abandon = new AbortController();
    const work = start(abandon.signal);
    unsettled.add(what);
    void forgetWhenSettled(work, () => unsettled.delete(what));
    return withDeadline(work, ms, what, abandon);
  };
  const at = () => iso(now());
  // Outside the tick's try: git needs neither atc nor the capacity reading.
  for (const r of runAllTreeSyncs(db, d.me)) {
    if (r.error) {
      d.log(`${at()} ${r.tree} tree sync failed: ${r.error}`);
    } else if (r.sync && (r.sync.changed || r.sync.reattached || !r.sync.ok)) {
      d.log(`${at()} ${r.tree === 'hq' ? 'defs' : r.tree} tree: ${r.sync.line}`);
    }
  }
  try {
    await runLinearReadyTick(db, { call: makeAuditedLinearCaller(db, d.run), readLanes: readPacingLanes, actor: d.me, deadlineMs: ms });
  } catch (error) {
    d.log(`${at()} lanes Ready from Linear failed: ${msg(error)}`);
  }
  try {
    const r = tick(db, await step('capacity', () => readCapacity(d.run)), d.me);
    const q = queueReminder(db, d.me);
    if (q.reminded) d.log(`${at()} reminded ${owner()} about ${q.reminded}`);
    await step('notes and sweep', () => d.steps.runs());
    try {
      if (await step('weekly stats', () => d.steps.weekly())) d.log(`${at()} filed the weekly stats line`);
    } catch (e) {
      d.log(`${at()} weekly stats failed: ${msg(e)}`);
    }
    try {
      // Merged PR kinds: yesterday and today, at most every 30 min.
      if (Date.now() - Date.parse(getMeta(db, 'kinds_synced_at') ?? '1970-01-01T00:00:00Z') > 30 * 60_000) {
        // Linear's side re-reads 2 days: a type set just after an issue closes still lands.
        const k = await step('merged PR kinds', () => syncKinds(db, d.run, { from: new Date(Date.now() - LOOKBACK_DAYS * 86_400_000), maxDays: 3, env: cleanEnv() }));
        setMeta(db, 'kinds_synced_at', at());
        if (!k.left) setMeta(db, 'kinds_ok_at', at()); // what the daily check-in trusts, with linear_synced_at
        if (k.days.length) clearGhAuth(db); // syncKinds throws on a failed gh call: a fetched day means GitHub answered
        const linearAt = now();
        const linearFrom = new Date(linearAt.getTime() - 2 * 86_400_000);
        await step('Linear issue types', () => syncLinear(db, makeAuditedLinearCaller(db, d.run), linearFrom, linearAt));
        const alerted = sendThroughputAlerts(db, d.me, linearFrom, linearAt);
        if (alerted.length > 0) {
          d.log(`${at()} goals: told triage about ${alerted.join(', ')}`);
        }
        if (k.days.length > 2) d.log(`${at()} merged PR kinds: fetched ${k.days.join(', ')}`);
      }
    } catch (e) {
      noteGhAuth(db, msg(e));
      d.log(`${at()} merged PR kinds failed: ${msg(e)}`);
    }
    try {
      // Team-goals numbers: every day of the last LOOKBACK_DAYS not yet fetched (after a gap, the
      // weekly's two weeks fill again), at most every 30 min.
      if (Date.now() - Date.parse(getMeta(db, 'goals_synced_at') ?? '1970-01-01T00:00:00Z') > 30 * 60_000) {
        const goals = await step('team goals', (signal) => syncGoals(db, d.run, { from: new Date(Date.now() - LOOKBACK_DAYS * 86_400_000), maxRepoDays: 80, env: cleanEnv(), signal }));
        const spendFailure = await step('Actions spend', () => refreshActionsSpend(db, d.run, now(), cleanEnv()));
        setMeta(db, 'goals_synced_at', at()); // the 30-min throttle: set even when a fetch failed

        // What the daily check-in trusts: repo-days and deploy-prod runs the caps left are not yet counted.
        if (goals.errors.length === 0 && goals.left === 0 && goals.deployLeft === 0) {
          setMeta(db, 'goals_ok_at', at());
        }
        if (!goals.errors.some(isGhAuthFailure)) {
          clearGhAuth(db);
        }
        for (const failure of goals.errors) {
          noteGhAuth(db, failure);
        }
        if (goals.errors.length > 0) {
          d.log(`${at()} team goals: ${goals.errors.length} fetch(es) failed: ${goals.errors.slice(0, 2).join('; ')}`);
        }
        if (spendFailure) {
          d.log(`${at()} Actions spend unknown: ${spendFailure}`);
        }
      }
    } catch (e) {
      noteGhAuth(db, msg(e));
      d.log(`${at()} team goals failed: ${msg(e)}`);
    }
    try {
      // Runs whose merged PRs have all shipped in a release move on, at most every 10 min.
      if (dueForShipPass(db)) {
        const s = await step('releases', () => shipRuns(db, d.run, now()));
        setMeta(db, CHECKED_AT, at()); // the throttle: set even when a fetch failed
        if (s.moved.length) d.log(`${at()} releases: moved ${s.moved.map((m) => `${m.issue} to ${m.to}`).join(', ')}`);
        if (s.errors.length) d.log(`${at()} releases: ${s.errors.length} problem(s): ${s.errors.slice(0, 2).join('; ')}`);
      }
    } catch (e) {
      noteGhAuth(db, msg(e));
      d.log(`${at()} releases failed: ${msg(e)}`);
    }
    try {
      const conditions = await step('unblock conditions', () => runUnblockConditionsTick(db, { call: makeAuditedLinearCaller(db, d.run), run: d.run }, d.me));
      if (conditions && conditions.settled.length > 0) {
        d.log(`${at()} unblock conditions: closed ${conditions.settled.join(', ')} as done`);
      }
      if (conditions && conditions.dropped.length > 0) {
        d.log(`${at()} unblock conditions: dropped ${conditions.dropped.join(', ')}`);
      }
      if (conditions && conditions.overdue.length > 0) {
        d.log(`${at()} unblock conditions: overdue, sessions told: ${conditions.overdue.join(', ')}`);
      }
      for (const problem of conditions?.errors ?? []) {
        d.log(`${at()} unblock conditions: ${problem}`);
      }
    } catch (error) {
      noteGhAuth(db, msg(error));
      d.log(`${at()} unblock conditions failed: ${msg(error)}`);
    }

    // Set only by a GitHub pass in this tick that read every PR: the one pass a drop may trust.
    let cleanGitHubAt: string | null = null;
    try {
      const factsAt = at();
      const facts = await step('run PRs on GitHub', () => runGitHubFactsTick(db, d.run));
      if (facts && facts.errors.length === 0) {
        cleanGitHubAt = factsAt;
      }
      if (facts && facts.closed.length > 0) {
        d.log(`${at()} run PRs: closed ${facts.closed.join(', ')} as GitHub reports`);
      }
      if (facts && facts.attached.length > 0) {
        d.log(`${at()} run PRs: attached ${facts.attached.join(', ')}`);
      }

      // One line per problem, every one of them: each names the PR that needs a look.
      for (const problem of facts?.errors ?? []) {
        d.log(`${at()} run PRs: ${problem}`);
      }
    } catch (error) {
      noteGhAuth(db, msg(error));
      d.log(`${at()} run PRs failed: ${msg(error)}`);
    }
    try {
      // The Linear state of each open run's issue, at most every 10 min: the sweep alerts on a
      // closed issue. A run whose issue was canceled with no open or merged PR drops only after a
      // clean GitHub pass in this same tick has attached every new PR.
      if (now().getTime() - Date.parse(getMeta(db, 'run_issues_checked_at') ?? '1970-01-01T00:00:00Z') > 10 * 60_000) {
        // The throttle: set even when the read fails.
        setMeta(db, 'run_issues_checked_at', at());
        await step('run issues in Linear', () => syncRunIssues(db, makeAuditedLinearCaller(db, d.run)));
        const dropped = dropCanceledRuns(db, d.me, cleanGitHubAt);
        if (dropped.length > 0) {
          d.log(`${at()} run issues: dropped ${dropped.join(', ')}, canceled in Linear before any merge`);
        }
      }
    } catch (error) {
      d.log(`${at()} run issues in Linear failed: ${msg(error)}`);
    }
    try {
      if (sampleUsage(db)) d.log(`${at()} Claude usage: new reading stored`);
    } catch (e) {
      d.log(`${at()} Claude usage sample failed: ${msg(e)}`);
    }
    try {
      const m = morningTick(db, d.me);
      if (m) d.log(`${at()} morning reports due: told ${owner()} (${m.key}${m.detail ? `, ${m.detail}` : ''})`);
    } catch (e) {
      d.log(`${at()} morning reports failed: ${msg(e)}`);
    }
    try {
      if (runCallReadyMorningTick(db, d.me)) {
        d.log(`${at()} morning call ready: told ${owner()}`);
      }
    } catch (error) {
      d.log(`${at()} morning call ready failed: ${msg(error)}`);
    }
    try {
      if (runUnblockChangedTick(db, d.me)) {
        d.log(`${at()} unblock list changed: told ${owner()}`);
      }
    } catch (error) {
      d.log(`${at()} unblock list changed failed: ${msg(error)}`);
    }
    try {
      const audit = runWeeklyAuditTick(db, d.me);
      if (audit) {
        d.log(`${at()} weekly audit due: told ${owner()} (${audit.key})`);
      }
    } catch (error) {
      d.log(`${at()} weekly audit failed: ${msg(error)}`);
    }
    // After the goals sync (CI minutes come from it) and before the check-in that quotes the sample.
    try {
      const c = d.steps.capacity ? await step('capacity sample', () => d.steps.capacity!()) : null;
      if (c && (c.opened.length || c.cleared.length)) d.log(`${at()} capacity: ${c.opened.length} opened, ${c.cleared.length} cleared`);
    } catch (e) {
      d.log(`${at()} capacity failed: ${msg(e)}`);
    }
    try {
      // After the goals sync, so the numbers it sends are fresh.
      const g = goalsDailyTick(db, d.me);
      if (g.run) d.log(`${at()} goals check-in due: told ${owner()} (${g.run.key}${g.run.detail ? `, ${g.run.detail}` : ''})`);
      else if (g.waiting) d.log(`${at()} goals check-in waits: ${g.waiting}`);
    } catch (e) {
      d.log(`${at()} goals check-in failed: ${msg(e)}`);
    }
    // Before the weekly, so its refusals line counts what the scan finds this tick.
    try {
      const n = d.steps.refusals ? await step('refusals', () => d.steps.refusals!()) : 0;
      if (n > 0) d.log(`${at()} found ${n} refusals`);
    } catch (e) {
      d.log(`${at()} refusals scan failed: ${msg(e)}`);
    }
    try {
      const g = goalsWeeklyTick(db, d.me);
      if (g.run) d.log(`${at()} goals weekly due: told ${owner()} (${g.run.key}${g.run.detail ? `, ${g.run.detail}` : ''})`);
      else if (g.waiting) d.log(`${at()} goals weekly waits: ${g.waiting}`);
    } catch (e) {
      d.log(`${at()} goals weekly failed: ${msg(e)}`);
    }
    try {
      const h = await step('health', () => d.steps.health());
      if (h.opened.length || h.cleared.length) d.log(`${at()} health: ${h.opened.length} new, ${h.cleared.length} cleared`);
    } catch (e) {
      d.log(`${at()} health failed: ${msg(e)}`);
    }
    takeQueued(); // the watcher sends every pending row, its own and the rest
    const f = await step('send', () => flush(db, { retryFailed: true }));
    d.log(`${r.at} slots=${r.slots} free=${r.freeMib} eligible=${r.eligible ?? '?'} ${r.nudged ? 'NUDGED' : r.why}${f.failed ? ` send-failed: ${f.errors.join('; ')}` : ''}`);
    setMeta(db, LAST_TICK, at());
    return true;
  } catch (e) {
    d.log(`${at()} tick failed: ${msg(e)}`);
    return false;
  }
}

// The steps each watcher has started and not yet seen settle. A step the deadline gave up on stays
// here until its work stops, so a later pass never runs a second copy beside it.
const UNSETTLED = new WeakMap<WatchDeps, Set<string>>();

function readUnsettled(deps: WatchDeps): Set<string> {
  let names = UNSETTLED.get(deps);
  if (names === undefined) {
    names = new Set();
    UNSETTLED.set(deps, names);
  }
  return names;
}

// The step's own caller reports its failure; this only waits for the work to stop.
async function forgetWhenSettled(work: Promise<unknown>, forget: () => void): Promise<void> {
  try {
    await work;
  } catch {
    // reported by the caller of withDeadline
  } finally {
    forget();
  }
}
