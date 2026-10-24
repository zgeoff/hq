import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { setMeta } from '../../db/set-meta.ts';
import { HqError } from '../../errors.ts';
import { logEvent } from '../../log-event.ts';
import { addNews } from '../../news/add-news.ts';
import { CAP_TRANSITIONS } from './cap-transitions.ts';
import type { CapAction, CapState } from './cap-transitions.ts';
import { formatCapUntil } from './format-cap-until.ts';
import type { LanesCap } from './lanes-cap.ts';
import { LANES_CAP_KEY } from './lanes-cap-key.ts';
import { readLanesCap } from './read-lanes-cap.ts';

export interface CapMove {
  action: CapAction;

  cap: LanesCap;
  actor: string;

  reason: string | null;
}

export function writeLanesCap(db: Database, move: CapMove): number {
  const stored = readLanesCap(db);
  const from: CapState = stored.kind === 'set' ? 'set' : 'none';
  const row = CAP_TRANSITIONS[move.action];
  const allowed: readonly CapState[] = row.from;
  if (!allowed.includes(from)) {
    throw new HqError('bad_state', `no lanes cap is set, so ${move.action} cannot apply`, { state: from });
  }
  const value = row.to === 'set' ? JSON.stringify(move.cap) : null;
  setMeta(db, LANES_CAP_KEY, value);
  const seq = logEvent(db, 'hq', 'lanes', move.action, move.actor, from, row.to, { cap: move.cap.cap, until: move.cap.until, reason: move.cap.reason, by: move.cap.by });
  addNews(db, { from: move.actor, topic: 'other', text: formatCapNews(move), issue: null, link: null, needsGeoff: false });
  return seq;
}

function formatCapNews(move: CapMove): string {
  const until = move.cap.until === null ? '' : ` until ${formatCapUntil(move.cap.until)} Sydney`;
  const reason = move.reason === null ? '' : ` (${move.reason})`;
  return match(move.action)
    .with('cap-set', () => `${move.actor} capped working delivery sessions at ${move.cap.cap}${until}${reason}`)
    .with('cap-off', () => `${move.actor} lifted the lanes cap of ${move.cap.cap}${reason}`)
    .with('cap-ended', () => `Lanes cap ${move.cap.cap} ended${move.cap.until === null ? '' : ` (set until ${formatCapUntil(move.cap.until)})`}`)
    .exhaustive();
}
