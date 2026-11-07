// Rows from before the bulk import are left out: their times mark the import, not the work.
import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { z } from 'zod';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { dist } from './dist.ts';
import { getCutoff as cutoff } from './get-cutoff.ts';
import type { GhMerge, Oldest, Stats } from './types.ts';

const MergedPRsSchema = z.array(z.object({ ref: z.string(), merged_at: z.string() }));
const MergeDataSchema = z.object({ ref: z.string() });
const RefsSchema = z.array(z.object({ ref: z.string() }));
const RefDataSchema = z.object({ ref: z.string().optional() });
const MergeEventsSchema = z.array(z.object({ issue: z.string(), action: z.string(), seq: z.number(), at: z.string(), data: z.string() }));
const MovesSchema = z.array(z.object({ issue: z.string(), seq: z.number() }));
const DoneEventsSchema = z.array(z.object({ issue: z.string(), seq: z.number(), at: z.string() }));
const RunsSchema = z.array(z.object({ issue: z.string(), state: z.string(), created_at: z.string(), closed_at: z.string().nullable(), ready_since: z.string().nullable() }));

const AskSchema = buildRowSchema('asks').pick({ id: true, state: true, queued_at: true, answered_at: true, applied_at: true });
const UnblockSchema = buildRowSchema('unblocks').pick({ id: true, state: true, added_at: true, closed_at: true });
const StateEventSchema = z.object({ issue: z.string(), at: z.string(), to_state: z.string().nullable(), data: z.string() });
const StateDataSchema = z.object({ waitsOn: z.string().nullable().optional(), waitsOnGeoff: z.boolean().optional() });
const WaitingSchema = z.object({ issue: z.string() });
const SampleSchema = buildRowSchema('lanes_samples').pick({ at: true, slots: true, eligible: true, error: true });
const NudgeSchema = buildRowSchema('lanes_nudges').pick({ slots: true, slots_after: true });
const FirstReviewSchema = z.object({ ref: z.string().nullable(), at: z.string() });
const RoundSchema = buildRowSchema('run_prs').pick({ ref: true, review_round: true });

const mins = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;
const clip = (s: string, lo: string, hi: string) => (s < lo ? lo : s > hi ? hi : s);
const repoOf = (ref: string) => ref.split('#')[0]!;

export function computeStats(db: Database, opts: { from: string; to: string; gh: GhMerge[] | null }): Stats {
  const from = opts.from < cutoff() ? cutoff() : opts.from;
  const to = opts.to;
  const inWin = (t: string | null) => !!t && t >= from && t < to;

  const asks = runSyncQuery(db, kdb(db).selectFrom('asks').select(['id', 'state', 'queued_at', 'answered_at', 'applied_at']).compile(), AskSchema);
  const qa = asks.filter((a) => inWin(a.answered_at) && a.queued_at >= cutoff() && a.answered_at! >= a.queued_at).map((a) => mins(a.queued_at, a.answered_at!));
  const ap = asks.filter((a) => inWin(a.applied_at) && a.answered_at && a.answered_at >= cutoff()).map((a) => mins(a.answered_at!, a.applied_at!));
  const oldestOf = (rows: { id: string; t: string }[]): Oldest | null => {
    const r = rows.sort((a, b) => (a.t < b.t ? -1 : 1))[0];
    return r ? { id: r.id, ageMin: Math.round(mins(r.t, to)) } : null;
  };
  const oldestQueued = oldestOf(asks.filter((a) => a.state === 'queued' || a.state === 'open').map((a) => ({ id: a.id, t: a.queued_at })));
  const oldestUnapplied = oldestOf(asks.filter((a) => a.state === 'answered').map((a) => ({ id: a.id, t: a.answered_at ?? a.queued_at })));

  const unb = runSyncQuery(db, kdb(db).selectFrom('unblocks').select(['id', 'state', 'added_at', 'closed_at']).compile(), UnblockSchema);
  const ud = unb.filter((u) => u.state === 'done' && inWin(u.closed_at) && u.added_at >= cutoff()).map((u) => mins(u.added_at, u.closed_at!));
  const oldestUnblock = oldestOf(unb.filter((u) => u.state === 'open').map((u) => ({ id: u.id, t: u.added_at })));

  const runs = RunsSchema.parse(db.query('SELECT issue, state, created_at, closed_at, ready_since FROM runs WHERE created_at >= ? AND design_lane IS NULL').all(cutoff()));
  const stateEvents = runSyncQuery(db, kdb(db).selectFrom('events').select(['subject_id as issue', 'at', 'to_state', 'data']).where('subject', '=', 'run').where('action', '=', 'state').orderBy('seq').compile(), StateEventSchema);
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
      const data = StateDataSchema.parse(JSON.parse(e.data));
      let next: boolean = geoff;
      let nextExact: boolean = exact;
      if (data.waitsOnGeoff !== undefined) {
        next = data.waitsOnGeoff;
        nextExact = true;
      } else if (data.waitsOn !== undefined) {
        next = /\b(?:geoff|the owner)\b/iu.test(data.waitsOn ?? '');
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

  // A merge counts from when GitHub merged it, which hq can see minutes after the event it logs.
  const mergedPRs = MergedPRsSchema.parse(db.query(`SELECT ref, merged_at FROM run_prs WHERE state = 'merged' AND merged_at IS NOT NULL`).all());
  const mergedAt = new Map(mergedPRs.map((pr) => [pr.ref, pr.merged_at]));
  const designPassRefs = new Set(RefsSchema.parse(db.query('SELECT ref FROM run_prs WHERE design_pass = 1').all()).map((row) => row.ref));
  const mergeEvents = MergeEventsSchema.parse(db.query(`SELECT subject_id AS issue, action, seq, at, data FROM events WHERE subject = 'run' AND action IN ('merged', 'unmerged') ORDER BY seq`).all());
  const merges: { issue: string; seq: number; at: string; data: string }[] = [];
  for (const event of mergeEvents) {
    const ref = RefDataSchema.parse(JSON.parse(event.data)).ref;
    if (event.action === 'merged') {
      const merged = MergeDataSchema.parse(JSON.parse(event.data));
      if (!designPassRefs.has(merged.ref)) {
        merges.push({ issue: event.issue, seq: event.seq, at: mergedAt.get(merged.ref) ?? event.at, data: event.data });
      }
      continue;
    }
    const index = merges.findLastIndex((merge) => RefDataSchema.parse(JSON.parse(merge.data)).ref === ref);
    if (index !== -1) {
      merges.splice(index, 1);
    }
  }
  merges.sort((left, right) => left.at.localeCompare(right.at));
  const lastMerge = new Map<string, { at: string; repo: string }>();
  const mergeTimes: number[] = [];
  const perRepo: Record<string, number[]> = {};
  // The last completion before the window ends: a later reopen and close must not hide it.
  const doneAt = new Map<string, string>();

  // A build run that took over its design pass's row starts at the move: by event order, since the pass's
  // done and the move can share a second.
  const buildStarts = new Map(MovesSchema.parse(db.query("SELECT subject_id AS issue, MAX(seq) AS seq FROM events WHERE subject = 'run' AND action = 'design-to-build' GROUP BY subject_id").all()).map((move) => [move.issue, move.seq]));
  const doneEvents = DoneEventsSchema.parse(db.query("SELECT subject_id AS issue, seq, at FROM events WHERE subject = 'run' AND action = 'state' AND to_state = 'done' AND at < ? ORDER BY seq").all(to));
  for (const event of doneEvents.filter((doneEvent) => doneEvent.seq > (buildStarts.get(doneEvent.issue) ?? 0))) {
    doneAt.set(event.issue, event.at);
  }
  for (const r of runs) {
    const done = doneAt.get(r.issue);
    if (!done || !inWin(done)) continue;
    const last = merges.findLast((merge) => merge.issue === r.issue && merge.seq > (buildStarts.get(r.issue) ?? 0) && merge.at <= done);
    if (!last) continue;
    const m = mins(last.at, done);
    const repo = repoOf(readMergeRef(last.data));
    mergeTimes.push(m);
    (perRepo[repo] ??= []).push(m);
  }
  for (const merge of merges) {
    lastMerge.set(merge.issue, { at: merge.at, repo: repoOf(readMergeRef(merge.data)) });
  }
  const waiting = runSyncQuery(db, sql`SELECT issue FROM runs WHERE state IN ('merged', 'deploying', 'deploy-held', 'live-check')`.compile(kdb(db)), WaitingSchema);
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

  const samples = runSyncQuery(db, kdb(db).selectFrom('lanes_samples').select(['at', 'slots', 'eligible', 'error']).where('at', '>=', from).where('at', '<', to).orderBy('seq').compile(), SampleSchema);
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
  const nudges = runSyncQuery(db, kdb(db).selectFrom('lanes_nudges').select(['slots', 'slots_after']).where('at', '>=', from).where('at', '<', to).compile(), NudgeSchema);

  const days = Math.max(1 / 24, (Date.parse(to) - Date.parse(from)) / 86_400_000);
  const mergesPerDay: Record<string, number> = {};
  let source: 'github' | 'hq' = 'hq';
  if (opts.gh) {
    source = 'github';
    for (const m of opts.gh) if (inWin(m.mergedAt)) mergesPerDay[m.repo] = (mergesPerDay[m.repo] ?? 0) + 1;
  } else {
    for (const merge of merges) {
      if (!inWin(merge.at)) {
        continue;
      }
      const repo = repoOf(readMergeRef(merge.data));
      mergesPerDay[repo] = (mergesPerDay[repo] ?? 0) + 1;
    }
  }
  // Under a day, the counts stay counts: a rate from a few hours overstates.
  if (days >= 1) for (const k of Object.keys(mergesPerDay)) mergesPerDay[k] = Math.round((mergesPerDay[k]! / days) * 10) / 10;

  const firstReview = runSyncQuery(db, sql`SELECT json_extract(data, '$.ref') AS ref, MIN(at) AS at FROM events WHERE subject = 'run' AND action = 'reviewed' GROUP BY ref`.compile(kdb(db)), FirstReviewSchema);
  const rounds = new Map(runSyncQuery(db, kdb(db).selectFrom('run_prs').select(['ref', 'review_round']).compile(), RoundSchema).map((round) => [round.ref, round.review_round]));
  const reviewed = firstReview.filter((r) => inWin(r.at));
  const rechecked = reviewed.filter((review) => ((review.ref === null ? undefined : rounds.get(review.ref)) ?? 0) >= 2).length;

  const cycle: number[] = [];
  let fromReady = 0;
  for (const r of runs) {
    const done = doneAt.get(r.issue);
    if (!done || !inWin(done)) continue;
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

function readMergeRef(data: string): string {
  return MergeDataSchema.parse(JSON.parse(data)).ref;
}
