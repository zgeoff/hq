import type { ImpRoom, LaneConfig, LaneView } from './types.ts';

// room: the imp slots free now under impd's budget and its non-Nix line (null: no reading).
export function buildLaneViews(lanes: LaneConfig[], running: Record<string, number>, ready: Record<string, { n: number | null; at: string | null }>, room: ImpRoom | null): LaneView[] {
  const FLEXIBLE = 'flexible';
  let impLeft = room?.slots ?? 0;
  // Fill the imp cap in pacing.json's order, the order delivery breaks ties in.
  const views: LaneView[] = lanes.map((l) => {
    const open = Math.max(0, l.size - (running[l.name] ?? 0));
    let free = open;
    if (l.place === 'imp') {
      free = Math.min(open, impLeft);
      impLeft -= free;
    }
    const r = ready[l.name] ?? { n: null, at: null };
    return { name: l.name, place: l.place, size: l.size, running: running[l.name] ?? 0, free, held: free < open ? (room?.heldBy ?? 'no imp reading') : null, ready: r.n, readyAt: r.at, lendTo: null };
  });
  // Areas with more Ready than free slots, nixie first and flexible last.
  const rank = (v: LaneView) => (v.name.startsWith('nixie') ? 0 : v.name === FLEXIBLE ? 2 : 1);
  const short = views
    .filter((v) => canLend(lanes, v.name) && v.ready !== null && v.ready > v.free)
    .map((v) => ({ name: v.name, rank: rank(v), want: v.ready! - v.free }))
    .sort((a, b) => a.rank - b.rank);
  for (const v of views) {
    if (v.place !== 'imp' || v.free === 0 || v.ready !== 0 || !canLend(lanes, v.name)) {
      continue;
    }
    const to = short.find((x) => x.want > 0 && x.name !== v.name);
    if (!to) continue;
    v.lendTo = to.name;
    to.want -= v.free;
  }
  return views;
}

// A lane pacing.json marks `lends: false` neither lends its slots nor borrows another's.
function canLend(lanes: readonly LaneConfig[], name: string): boolean {
  return lanes.find((lane) => lane.name === name)?.lends !== false;
}
