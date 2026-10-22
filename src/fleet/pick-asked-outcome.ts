import { match } from 'ts-pattern';
import { STALE_LIMITS } from './stale-limits.ts';

export type AskedOutcome = 'restart' | 'skip' | 'wait';

export type AskedAnswer = { kind: 'saved'; answeredAt: number | undefined; busyReason: string | null } | { kind: 'busy' } | { kind: 'unanswered' } | { kind: 'pending' } | { kind: 'unread' };

export interface AskedReading {
  answer: AskedAnswer;
  askedAtMs: number;
  nowMs: number;
}

// A session that said saved has just been active, so a busy quiet point after `saved` waits, and
// skips only once the save timeout has passed since the answer.
export function pickAskedOutcome(reading: AskedReading): AskedOutcome {
  return match<AskedAnswer, AskedOutcome>(reading.answer)
    .with({ kind: 'busy' }, { kind: 'unanswered' }, () => 'skip')
    .with({ kind: 'saved', busyReason: null }, () => 'restart')
    .with({ kind: 'saved' }, (saved) => pickTimedOutcome(reading.nowMs, saved.answeredAt ?? reading.askedAtMs))
    .with({ kind: 'pending' }, () => pickTimedOutcome(reading.nowMs, reading.askedAtMs))
    .with({ kind: 'unread' }, () => 'wait')
    .exhaustive();
}

function pickTimedOutcome(nowMs: number, sinceMs: number): AskedOutcome {
  if (nowMs - sinceMs >= STALE_LIMITS.saveTimeoutMs) {
    return 'skip';
  }
  return 'wait';
}
