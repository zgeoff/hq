import { expect, test } from 'bun:test';
import { countHeldMs } from './count-held-ms.ts';

test('it counts the overlap of each span with the interval and keeps only the spans that end after it', () => {
  const ended = { from: '2026-10-14T01:02:00Z', until: '2026-10-14T01:05:00Z' };
  const running = { from: '2026-10-14T01:08:00Z', until: '2026-10-14T01:30:00Z' };

  expect(countHeldMs([ended, running], '2026-10-14T01:00:00Z', new Date('2026-10-14T01:10:00Z'))).toStrictEqual({ heldMs: 5 * 60_000, kept: [running] });
});

test('it counts no held time when no look came before', () => {
  expect(countHeldMs([{ from: '2026-10-14T01:02:00Z', until: '2026-10-14T01:05:00Z' }], null, new Date('2026-10-14T01:10:00Z'))).toStrictEqual({ heldMs: 0, kept: [] });
});
