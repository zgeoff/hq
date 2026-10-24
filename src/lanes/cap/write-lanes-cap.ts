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

export type CapMove = { action: CapAction; cap: LanesCap; actor: string; reason: string | null } | { action: 'cap-off'; cap: null; error: string; actor: string; reason: string | null };

export function writeLanesCap(db: Database, move: CapMove): number {
  const stored = readLanesCap(db);
  const from: CapState = stored.kind;
  const row = CAP_TRANSITIONS[move.action];
  const allowed: readonly CapState[] = row.from;
  if (!allowed.includes(from)) {
    throw new HqError('bad_state', `the stored lanes cap is ${from === 'bad' ? 'unusable' : 'not set'}, so ${move.action} cannot apply`, { state: from });
  }
  if ((move.cap === null) !== (from === 'bad' && move.action === 'cap-off')) {
    throw new HqError('bad_state', 'a lift names the stored cap, unless the stored value is unusable', { state: from });
  }
  const value = row.to === 'set' ? JSON.stringify(move.cap) : null;
  setMeta(db, LANES_CAP_KEY, value);
  const detail = move.cap === null ? { error: move.error, reason: move.reason } : { cap: move.cap.cap, until: move.cap.until, reason: move.reason, by: move.cap.by };
  const seq = logEvent(db, 'hq', 'lanes', move.action, move.actor, from, row.to, detail);
  addNews(db, { from: move.actor, topic: 'other', text: formatCapNews(move), issue: null, link: null, needsGeoff: false });
  return seq;
}

function formatCapNews(move: CapMove): string {
  const reason = move.reason === null ? '' : ` (${move.reason})`;
  if (move.cap === null) {
    return `${move.actor} cleared an unusable lanes cap${reason}: ${move.error}`;
  }
  const cap = move.cap;
  const until = cap.until === null ? '' : ` until ${formatCapUntil(cap.until)} Sydney`;
  return match(move.action)
    .with('cap-set', () => `${move.actor} capped working delivery sessions at ${cap.cap}${until}${reason}`)
    .with('cap-off', () => `${move.actor} lifted the lanes cap of ${cap.cap}${reason}`)
    .with('cap-ended', () => `Lanes cap ${cap.cap} ended${cap.until === null ? '' : ` (set until ${formatCapUntil(cap.until)})`}`)
    .exhaustive();
}
