import { fmtMin } from './fmt-min.ts';
import { formatPct as pct } from './format-pct.ts';
import type { Stats } from './types.ts';

// One line for the weekly news item.
export function headline(s: Stats): string {
  const g = s.geoff;
  return `Week's numbers: calls answered in ${fmtMin(g.queueToAnswer.medianMin)} (n=${g.queueToAnswer.n}); merge→live ${fmtMin(s.live.mergeToDone.medianMin)} (n=${s.live.mergeToDone.n}), ${s.live.backlog.total} waiting; ${s.idle.slotMinutesWhileReady} slot-min idle while Ready waited; rework ${pct(s.flow.reworkShare)} of ${s.flow.reviewed}. hq stats for more.`.slice(0, 400);
}
