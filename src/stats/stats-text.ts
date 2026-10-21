import { fmtMin } from './fmt-min.ts';
import { formatPct as pct } from './format-pct.ts';
import { THIN } from './thin.ts';
import type { Dist, Oldest, Stats } from './types.ts';

const d = (x: Dist) => (x.n ? `median ${fmtMin(x.medianMin)}, p90 ${fmtMin(x.p90Min)} (n=${x.n}${x.thin ? ', too few to act on' : ''})` : 'no samples');
const old = (o: Oldest | null) => (o ? `${o.id}, ${fmtMin(o.ageMin)}` : 'none');

export function statsText(s: Stats): string {
  const g = s.geoff;
  const l = s.live;
  const i = s.idle;
  const f = s.flow;
  const conv = i.nudges - i.nudgesPending;
  return [
    `hq stats ${s.window.from} → ${s.window.to} (rows from before ${s.window.cutoff} left out)`,
    '',
    'Wait on the owner (z-stu acts: batch, reorder or chase what waits longest)',
    `  call/proposal queued → answered: ${d(g.queueToAnswer)}; oldest waiting: ${old(g.oldestQueued)}`,
    `  answered → applied:              ${d(g.answerToApply)}; oldest unapplied: ${old(g.oldestUnapplied)}`,
    `  unblock item added → done:       ${d(g.unblockAddedToDone)}; oldest open: ${old(g.oldestUnblock)}`,
    `  run time waiting on the owner:   ${d(g.runGeoffWait)}; longest now: ${old(g.oldestRunWait)}${g.runWaitExactShare !== null && g.runWaitExactShare < 1 ? ` (${pct(1 - g.runWaitExactShare)} matched by the word "Geoff" or "the owner", not --waits-on-geoff)` : ''}`,
    '',
    'Merged to live (z-delivery acts: release sooner, batch deploys, unblock the oldest)',
    `  last PR merge → run done: ${d(l.mergeToDone)}`,
    ...Object.entries(l.byRepo).map(([r, x]) => `    ${r}: ${d(x)}`),
    `  merged, not yet live: ${l.backlog.total}${l.backlog.total ? ` (${Object.entries(l.backlog.byRepo).map(([r, n]) => `${r} ${n}`).join(', ')}); oldest ${old(l.backlog.oldest)}` : ''}`,
    '',
    'Idle capacity while work is ready (z-delivery acts: launch sooner, keep Ready stocked)',
    `  slot-minutes free while Ready work waited: ${i.slotMinutesWhileReady}`,
    `  slot-minutes free with no fresh Ready count: ${i.slotMinutesUnknown}${i.staleShare !== null && i.staleShare > 0.2 ? `; READY COUNT STALE in ${pct(i.staleShare)} of ${i.samples} samples: no fresh per-lane Ready report` : ''}`,
    `  nudges that filled a slot within 10 min: ${i.nudgesConverted} of ${conv}${conv < THIN ? ' (too few to act on)' : ''}${i.nudgesPending ? `; ${i.nudgesPending} not yet checked` : ''}`,
    '',
    'Flow (the steward and z-delivery act: fix what slows merges or causes rework)',
    `  PRs merged ${f.days >= 1 ? `per day over ${f.days} days` : `in the last ${Math.round(f.days * 24)}h (under a day: counts, not a rate)`} (${f.mergesSource === 'github' ? 'all zgeoff, from GitHub' : "hq's tracked PRs only"}): ${Object.keys(f.mergesPerDay).length ? Object.entries(f.mergesPerDay).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ') : 'none'}`,
    `  review rework (first review found a must-fix): ${f.rechecked} of ${f.reviewed}, ${pct(f.reworkShare)}${f.reviewed < THIN ? ' (too few to act on)' : ''}`,
    `  cycle time to done: ${d(f.cycle)}; ${f.cycleFromReady} of ${f.cycle.n} from Ready (--ready-since), the rest from launch`,
  ].join('\n');
}
