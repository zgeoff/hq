import { iso } from '../clock/iso.ts';
import type { LowWaterAction } from './low-water-transitions.ts';
import { pickLowWater } from './pick-low-water.ts';

interface TopIssues {
  at: string;
  focus: string;
  issues: readonly { identifier: string; title: string }[];
}

export interface LowWaterInputs {
  eligible: number;
  free: number;
  promotable: { at: string; count: number | null; focus: string } | null;
  top: TopIssues | null;
  focus: string;
  freshMinutes: number;
  at: Date;
  since: string | null;
  alerted: boolean;
  held: boolean;
  target: string | null;
}

export interface LowWaterMoves {
  mark: number;
  episode: LowWaterAction | null;
  since: string | null;
  message: { subjectID: string; text: string } | null;
}

export function pickLowWaterMoves(input: LowWaterInputs): LowWaterMoves {
  const pick = pickLowWater(input);
  if (pick.phase === 'above') {
    return { mark: pick.mark, episode: input.since === null ? null : 'ended', since: null, message: null };
  }
  if (pick.phase === 'unclear') {
    return { mark: pick.mark, episode: null, since: input.since, message: null };
  }
  const since = input.since ?? iso(input.at);
  const episode = input.since === null ? 'started' : null;
  const alerted = input.since === null ? false : input.alerted;
  if (input.held || input.target === null || alerted) {
    return { mark: pick.mark, episode, since, message: null };
  }
  const top = input.top;
  const list = top !== null && top.focus === input.focus && top.at === input.promotable?.at && top.issues.length > 0 ? ` Promote now: ${top.issues.map((issue) => `${issue.identifier} ${issue.title}`).join('; ')}.` : '';
  return { mark: pick.mark, episode, since, message: { subjectID: `low-water:${since}`, text: `Lanes: ${input.eligible} eligible Ready for ${input.free} free slots (mark ${pick.mark}).${list} Run hq lanes promotable for the rest.` } };
}
