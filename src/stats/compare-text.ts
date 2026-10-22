import { fmtMin } from './fmt-min.ts';
import { formatPct as pct } from './format-pct.ts';
import type { Dist, Stats } from './types.ts';

// Before/after a mark: the headline numbers side by side.
export function compareText(mark: { id: number; at: string; text: string }, before: Stats, after: Stats): string {
  const row = (name: string, b: string, a: string) => `  ${name.padEnd(34)} ${b.padEnd(16)} ${a}`;
  const dd = (x: Dist) => `${fmtMin(x.medianMin)} (n=${x.n})`;
  return [
    `Around mark ${mark.id} at ${mark.at}: ${mark.text}`,
    row('', '7 days before', '7 days after'),
    row('call queued → answered (median)', dd(before.geoff.queueToAnswer), dd(after.geoff.queueToAnswer)),
    row('answered → applied (median)', dd(before.geoff.answerToApply), dd(after.geoff.answerToApply)),
    row('run time waiting on the owner (median)', dd(before.geoff.runGeoffWait), dd(after.geoff.runGeoffWait)),
    row('merge → done (median)', dd(before.live.mergeToDone), dd(after.live.mergeToDone)),
    row('slot-min idle while Ready waited', String(before.idle.slotMinutesWhileReady), String(after.idle.slotMinutesWhileReady)),
    row('review rework', `${pct(before.flow.reworkShare)} of ${before.flow.reviewed}`, `${pct(after.flow.reworkShare)} of ${after.flow.reviewed}`),
    row('cycle time to done (median)', dd(before.flow.cycle), dd(after.flow.cycle)),
    '  (n under 5 is too few to act on; the "after" window may not be over yet)',
  ].join('\n');
}
