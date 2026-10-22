import type { LaneView } from './types.ts';

// views: the lanes to name, each free long enough; minutes: how long each has been free.
export function lanesNudgeText(views: LaneView[], minutes: (v: LaneView) => number): string {
  const parts = views.map((v) => {
    const r = v.ready === null ? 'Ready unknown' : `${v.ready} Ready`;
    return `${v.name} ${v.free} free for ${minutes(v)} min (${r}${v.lendTo ? `; lend to ${v.lendTo}` : ''})`;
  });
  return `Lanes with free slots: ${parts.join('; ')}. Fill them now; a lent run counts in the lane it runs in. (hq lanes; you pick the issues and write the briefs. hq reads Ready from Linear every 10 min; when a lane shows Ready unknown, report it with hq lanes ready --lane name=n,...)`;
}
