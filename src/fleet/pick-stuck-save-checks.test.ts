import { expect, test } from 'bun:test';
import { pickStuckSaveChecks } from './pick-stuck-save-checks.ts';

test('it reports a save request asked over an hour ago whose every read since failed, with the last error', () => {
  const checks = pickStuckSaveChecks(
    { 'z-kettle': { sessionId: 'id-kettle-0001', phase: 'asked', askedAt: '2026-10-14T03:01:00Z', eventSeq: 7, skips: 0 } },
    [
      { sessionId: 'id-kettle-0001', at: '2026-10-14T03:06:00Z', error: 'invented: first failure' },
      { sessionId: 'id-kettle-0001', at: '2026-10-14T03:56:00Z', error: 'invented: last failure' },
    ],
    new Date('2026-10-14T04:02:00Z'),
  );

  expect(checks).toStrictEqual([
    { key: 'fleet-save-unread:z-kettle', ok: false, line: 'fleet: z-kettle (session id-kettl) was asked to save at 2026-10-14T03:01:00Z, and every read of its answer since failed: invented: last failure' },
  ]);
});

test.each([
  ['asked an hour ago to the second', { sessionId: 'id-kettle-0001', phase: 'asked' as const, askedAt: '2026-10-14T03:02:00Z', eventSeq: 7, skips: 0 }],
  ['read once since the ask', { sessionId: 'id-kettle-0001', phase: 'asked' as const, askedAt: '2026-10-14T03:01:00Z', answerReadAt: '2026-10-14T03:11:00Z', eventSeq: 7, skips: 0 }],
  ['idle between asks', { sessionId: 'id-kettle-0001', phase: 'idle' as const, skips: 1, retryAt: '2026-10-14T05:00:00Z' }],
])('it reports nothing stuck for a save request %s', (_, entry) => {
  const checks = pickStuckSaveChecks({ 'z-kettle': entry }, [{ sessionId: 'id-kettle-0001', at: '2026-10-14T03:06:00Z', error: 'invented: failure' }], new Date('2026-10-14T04:02:00Z'));

  expect(checks).toStrictEqual([{ key: 'fleet-save-unread', ok: true, line: 'fleet: hq can read the answer to every save request it asked' }]);
});

test('it reports nothing stuck when no read failed since the ask, such as for a request not yet sent', () => {
  const checks = pickStuckSaveChecks(
    { 'z-kettle': { sessionId: 'id-kettle-0001', phase: 'asked', askedAt: '2026-10-14T03:01:00Z', eventSeq: 7, skips: 0 } },
    [
      { sessionId: 'id-kettle-0001', at: '2026-10-14T02:56:00Z', error: 'invented: failure before the ask' },
      { sessionId: 'id-urn-0002', at: '2026-10-14T03:06:00Z', error: 'invented: failure of another session' },
    ],
    new Date('2026-10-14T04:02:00Z'),
  );

  expect(checks).toStrictEqual([{ key: 'fleet-save-unread', ok: true, line: 'fleet: hq can read the answer to every save request it asked' }]);
});
