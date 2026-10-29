// hq stats: numbers someone acts on. Each section names who acts and what they would change;
// a number from fewer than THIN samples says so. Rows from before CUTOFF (the bulk import)
// are left out: their times mark the import, not the work.
import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { dist } from './dist.ts';
import { getCutoff as cutoff } from './get-cutoff.ts';
import type { GhMerge, Oldest, Stats } from './types.ts';

const MergedPRsSchema = z.array(z.object({ ref: z.string(), merged_at: z.string() }));
const MergeDataSchema = z.object({ ref: z.string() });
const RunsSchema = z.array(z.object({ issue: z.string(), state: z.string(), created_at: z.string(), closed_at: z.string().nullable(), ready_since: z.string().nullable() }));

const mins = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;
const clip = (s: string, lo: string, hi: string) => (s < lo ? lo : s > hi ? hi : s);
const repoOf = (ref: string) => ref.split('#')[0]!;

export function computeStats(db: Database, opts: { from: string; to: string; gh: GhMerge[] | null }): Stats {
  const from = opts.from < cutoff() ? cutoff() : opts.from;
  const to = opts.to;
  const inWin = (t: string | null) => !!t && t >= from && t < to;

  // ---- wait on the owner
  const asks = db.query('SELECT id, state, queued_at, answered_at, applied_at FROM asks').all() as { id: string; state: string; queued_at: string; answered_at: string | null; applied_at: string | null }[];
  const qa = asks.filter((a) => inWin(a.answered_at) && a.queued_at >= cutoff() && a.answered_at! >= a.queued_at).map((a) => mins(a.queued_at, a.answered_at!));
  const ap = asks.filter((a) => inWin(a.applied_at) && a.answered_at && a.answered_at >= cutoff()).map((a) => mins(a.answered_at!, a.applied_at!));
  const oldestOf = (rows: { id: string; t: string }[]): Oldest | null => {
    const r = rows.sort((a, b) => (a.t < b.t ? -1 : 1))[0];
    return r ? { id: r.id, ageMin: Math.round(mins(r.t, to)) } : null;
  };
  const oldestQueued = oldestOf(asks.filter((a) => a.state === 'queued' || a.state === 'open').map((a) => ({ id: a.id, t: a.queued_at })));
  const oldestUnapplied = oldestOf(asks.filter((a) => a.state === 'answered').map((a) => ({ id: a.id, t: a.answered_at ?? a.queued_at })));

  const unb = db.query('SELECT id, state, added_at, closed_at FROM unblocks').all() as { id: string; state: string; added_at: string; closed_at: string | null }[];
  const ud = unb.filter((u) => u.state === 'done' && inWin(u.closed_at) && u.added_at >= cutoff()).map((u) => mins(u.added_at, u.closed_at!));
  const oldestUnblock = oldestOf(unb.filter((u) => u.state === 'open').map((u) => ({ id: u.id, t: u.added_at })));

  // A design pass is no delivery run, so its time is no part of these numbers.
  const runs = RunsSchema.parse(db.query('SELECT issue, state, created_at, closed_at, ready_since FROM runs WHERE created_at >= ? AND design_lane IS NULL').all(cutoff()));
  const stateEvents = db.query(`SELECT subject_id AS issue, at, to_state, data FROM events WHERE subject = 'run' AND action = 'state' ORDER BY seq`).all() as { issue: string; at: string; to_state: string; data: string }[];
  const byIssue = new Map<string, typeof stateEvents>();
  for (const e of stateEvents) byIssue.set(e.issue, [...(byIssue.get(e.issue) ?? []), e]);
  const waitTotals: number[] = [];
  let exactMin = 0;
  let allMin = 0;
  let oldestRunWait: Oldest | null = null;
  for (const r of runs) {
    let geoff = false;
    let exact = false;
    let since: string | null = null;
    let total = 0;
    const close = (t: string) => {
      if (geoff && since) {
        const m = Math.max(0, mins(clip(since, from, to), clip(t, from, to)));
        total += m;
        allMin += m;
        if (exact) exactMin += m;
      }
    };
    for (const e of byIssue.get(r.issue) ?? []) {
      const d = JSON.parse(e.data) as { waitsOn?: string | null; waitsOnGeoff?: boolean };
      let next: boolean = geoff;
      let nextExact: boolean = exact;
      if (d.waitsOnGeoff !== undefined) {
        next = d.waitsOnGeoff;
        nextExact = true;
      } else if (d.waitsOn !== undefined) {
        next = /\b(?:geoff|the owner)\b/iu.test(d.waitsOn ?? '');
        nextExact = false;
      }
      if (e.to_state === 'done' || e.to_state === 'dropped') next = false;
      if (next !== geoff || (geoff && nextExact !== exact)) {
        close(e.at);
        geoff = next;
        since = e.at;
      }
      exact = nextExact;
    }
    if (geoff) {
      close(to);
      const age = Math.round(mins(since!, to));
      if (!oldestRunWait || age > oldestRunWait.ageMin) oldestRunWait = { id: r.issue, ageMin: age };
    }
    if (total > 0) waitTotals.push(total);
  }

  // ---- merged to live
  // A merge that `hq run unmerge` took back did not happen: its later 'unmerged' event cancels it.
  // A merge counts from when GitHub merged it, which hq can see minutes after the event it logs.
  const mergedPRs = MergedPRsSchema.parse(db.query(`SELECT ref, merged_at FROM run_prs WHERE state = 'merged' AND merged_at IS NOT NULL`).all());
  const mergedAt = new Map(mergedPRs.map((pr) => [pr.ref, pr.merged_at]));
  const merges: { issue: string; at: string; data: string }[] = [];
  for (const e of db.query(`SELECT subject_id AS issue, action, at, data FROM events WHERE subject = 'run' AND action IN ('merged', 'unmerged') ORDER BY seq`).all() as { issue: string; action: string; at: string; data: string }[]) {
    if (e.action === 'merged') {
      const merged = MergeDataSchema.parse(JSON.parse(e.data));
      merges.push({ issue: e.issue, at: mergedAt.get(merged.ref) ?? e.at, data: e.data });
      continue;
    }
    const ref = (JSON.parse(e.data) as { ref?: string }).ref;
    const i = merges.findLastIndex((m) => (JSON.parse(m.data) as { ref?: string }).ref === ref);
    if (i >= 0) merges.splice(i, 1);
  }
  merges.sort((left, right) => left.at.localeCompare(right.at));
  const lastMerge = new Map<string, { at: string; repo: string }>();
  const mergeTimes: number[] = [];
  const perRepo: Record<string, number[]> = {};
  // The last completion before the window ends: a later reopen and close must not hide it.
  const doneAt = new Map<string, string>();
  for (const e of stateEvents) if (e.to_state === 'done' && e.at < to) doneAt.set(e.issue, e.at);
  for (const r of runs) {
    const done = doneAt.get(r.issue);

    // A build run that took over its design pass's row starts after the pass's done.
    if (!done || !inWin(done) || done < r.created_at) {
      continue;
    }
    const last = merges.filter((m) => m.issue === r.issue && m.at <= done).at(-1);
    if (!last) continue;
    const m = mins(last.at, done);
    const repo = repoOf((JSON.parse(last.data) as { ref: string }).ref);
    mergeTimes.push(m);
    (perRepo[repo] ??= []).push(m);
  }
  for (const m of merges) lastMerge.set(m.issue, { at: m.at, repo: repoOf((JSON.parse(m.data) as { ref: string }).ref) });
  const waiting = db.query(`SELECT issue FROM runs WHERE state IN ('merged', 'deploying', 'deploy-held', 'live-check')`).all() as { issue: string }[];
  const backlog: Stats['live']['backlog'] = { total: 0, byRepo: {}, oldest: null };
  for (const w of waiting) {
    const lm = lastMerge.get(w.issue);
    const repo = lm?.repo ?? 'unknown';
    backlog.total++;
    backlog.byRepo[repo] = (backlog.byRepo[repo] ?? 0) + 1;
    if (lm) {
      const age = Math.round(mins(lm.at, to));
      if (!backlog.oldest || age > backlog.oldest.ageMin) backlog.oldest = { id: w.issue, ageMin: age };
    }
  }

  // ---- idle capacity while work is ready
  const samples = db.query('SELECT at, slots, eligible, error FROM lanes_samples WHERE at >= ? AND at < ? ORDER BY seq').all(from, to) as { at: string; slots: number; eligible: number | null; error: string | null }[];
  let ready = 0;
  let unknown = 0;
  let stale = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.eligible === null) stale++;
    const nextAt = samples[i + 1]?.at ?? to;
    const dt = Math.min(mins(s.at, nextAt), 30);
    if (s.error || s.slots === 0) continue;
    if (s.eligible === null) unknown += s.slots * dt;
    else if (s.eligible > 0) ready += Math.min(s.slots, s.eligible) * dt;
  }
  const nudges = db.query('SELECT slots, slots_after FROM lanes_nudges WHERE at >= ? AND at < ?').all(from, to) as { slots: number; slots_after: number | null }[];

  // ---- flow
  const days = Math.max(1 / 24, (Date.parse(to) - Date.parse(from)) / 86_400_000);
  const mergesPerDay: Record<string, number> = {};
  let source: 'github' | 'hq' = 'hq';
  if (opts.gh) {
    source = 'github';
    for (const m of opts.gh) if (inWin(m.mergedAt)) mergesPerDay[m.repo] = (mergesPerDay[m.repo] ?? 0) + 1;
  } else for (const m of merges) if (inWin(m.at)) mergesPerDay[repoOf((JSON.parse(m.data) as { ref: string }).ref)] = (mergesPerDay[repoOf((JSON.parse(m.data) as { ref: string }).ref)] ?? 0) + 1;
  // Under a day, the counts stay counts: a rate from a few hours overstates.
  if (days >= 1) for (const k of Object.keys(mergesPerDay)) mergesPerDay[k] = Math.round((mergesPerDay[k]! / days) * 10) / 10;

  const firstReview = db.query(`SELECT json_extract(data, '$.ref') AS ref, MIN(at) AS at FROM events WHERE subject = 'run' AND action = 'reviewed' GROUP BY ref`).all() as { ref: string; at: string }[];
  const rounds = new Map((db.query('SELECT ref, review_round FROM run_prs').all() as { ref: string; review_round: number }[]).map((r) => [r.ref, r.review_round]));
  const reviewed = firstReview.filter((r) => inWin(r.at));
  const rechecked = reviewed.filter((r) => (rounds.get(r.ref) ?? 0) >= 2).length;

  const cycle: number[] = [];
  let fromReady = 0;
  for (const r of runs) {
    const done = doneAt.get(r.issue);

    // A build run that took over its design pass's row starts after the pass's done.
    if (!done || !inWin(done) || done < r.created_at) {
      continue;
    }
    cycle.push(mins(r.ready_since ?? r.created_at, done));
    if (r.ready_since) fromReady++;
  }

  return {
    window: { from, to, cutoff: cutoff() },
    geoff: {
      queueToAnswer: dist(qa),
      answerToApply: dist(ap),
      unblockAddedToDone: dist(ud),
      runGeoffWait: dist(waitTotals),
      oldestQueued,
      oldestUnapplied,
      oldestUnblock,
      oldestRunWait,
      runWaitExactShare: allMin ? Math.round((exactMin / allMin) * 100) / 100 : null,
    },
    live: { mergeToDone: dist(mergeTimes), byRepo: Object.fromEntries(Object.entries(perRepo).map(([k, v]) => [k, dist(v)])), backlog },
    idle: {
      slotMinutesWhileReady: Math.round(ready),
      slotMinutesUnknown: Math.round(unknown),
      staleShare: samples.length ? Math.round((stale / samples.length) * 100) / 100 : null,
      samples: samples.length,
      nudges: nudges.length,
      nudgesConverted: nudges.filter((n) => n.slots_after !== null && n.slots_after < n.slots).length,
      nudgesPending: nudges.filter((n) => n.slots_after === null).length,
    },
    flow: {
      mergesPerDay,
      mergesSource: source,
      days: Math.round(days * 10) / 10,
      reviewed: reviewed.length,
      rechecked,
      reworkShare: reviewed.length ? Math.round((rechecked / reviewed.length) * 100) / 100 : null,
      cycle: dist(cycle),
      cycleFromReady: fromReady,
    },
  };
}
