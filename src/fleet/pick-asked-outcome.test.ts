import { expect, test } from 'bun:test';
import { pickAskedOutcome } from './pick-asked-outcome.ts';
import type { AskedAnswer, AskedOutcome } from './pick-asked-outcome.ts';

test.each<[string, AskedAnswer, number, AskedOutcome]>([
  ['a busy answer', { kind: 'busy' }, 1, 'skip'],
  ['an unanswered message', { kind: 'unanswered' }, 1, 'skip'],
  ['a saved answer at a quiet point', { kind: 'saved', answeredAt: 60_000, busyReason: null }, 1, 'restart'],
  ['a saved answer with a busy session under ten minutes after it', { kind: 'saved', answeredAt: 300_000, busyReason: 'invented busy' }, 600_000, 'wait'],
  ['a saved answer with a busy session ten minutes after it', { kind: 'saved', answeredAt: 300_000, busyReason: 'invented busy' }, 900_000, 'skip'],
  ['a saved answer with no time and a busy session ten minutes after the ask', { kind: 'saved', answeredAt: undefined, busyReason: 'invented busy' }, 600_000, 'skip'],
  ['a pending answer under ten minutes after the ask', { kind: 'pending' }, 599_999, 'wait'],
  ['a pending answer ten minutes after the ask', { kind: 'pending' }, 600_000, 'skip'],
  ['an unread answer ten minutes after the ask', { kind: 'unread' }, 600_000, 'wait'],
])('it picks the outcome for %s', (_, answer, nowMs, expected) => {
  expect(pickAskedOutcome({ answer, askedAtMs: 0, nowMs })).toBe(expected);
});
