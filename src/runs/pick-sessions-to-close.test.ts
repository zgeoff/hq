import { expect, test } from 'bun:test';
import { pickSessionsToClose } from './pick-sessions-to-close.ts';
import type { ClaimedSession, SessionToClose } from './pick-sessions-to-close.ts';
import type { WrapUp } from './types.ts';

test.each<{ name: string; wrapUp: WrapUp; claimed: ClaimedSession[]; expected: SessionToClose[] }>([
  {
    name: 'a pinned session, and not one kept for unpushed work',
    wrapUp: { forgotten: [], destroyed: [], kept: [{ id: 'aaaa1111', reason: 'pinned in atc' }, { id: 'bbbb2222', reason: 'unpushed work' }], failed: [] },
    claimed: [{ id: 'aaaa1111', active: true }],
    expected: [{ session: 'aaaa1111', why: 'pinned' }],
  },
  {
    name: 'the one session whose forget failed',
    wrapUp: { forgotten: ['bbbb2222'], destroyed: [], kept: [], failed: [{ id: 'aaaa1111', reason: 'atc did not forget the session' }] },
    claimed: [
      { id: 'aaaa1111', active: true },
      { id: 'bbbb2222', active: true },
    ],
    expected: [{ session: 'aaaa1111', why: 'failed', reason: 'atc did not forget the session' }],
  },
  {
    name: 'each active session, and no ended one, when the whole wrap-up failed',
    wrapUp: { forgotten: [], destroyed: [], kept: [], failed: [{ id: 'GEO-51', reason: 'invented: the run vanished' }] },
    claimed: [
      { id: 'aaaa1111', active: false },
      { id: 'bbbb2222', active: true },
      { id: 'cccc3333', active: true },
    ],
    expected: [
      { session: 'bbbb2222', why: 'failed', reason: 'invented: the run vanished' },
      { session: 'cccc3333', why: 'failed', reason: 'invented: the run vanished' },
    ],
  },
  {
    name: 'no ended session when atc failed for every stored session',
    wrapUp: {
      forgotten: [],
      destroyed: [],
      kept: [],
      failed: [
        { id: 'aaaa1111', reason: 'atc: invented: atc is down' },
        { id: 'bbbb2222', reason: 'atc: invented: atc is down' },
      ],
    },
    claimed: [
      { id: 'aaaa1111', active: false },
      { id: 'bbbb2222', active: true },
    ],
    expected: [{ session: 'bbbb2222', why: 'failed', reason: 'atc: invented: atc is down' }],
  },
  {
    name: 'a failed sub-session the run never held',
    wrapUp: { forgotten: [], destroyed: [], kept: [], failed: [{ id: 'dddd4444-full', reason: 'atc did not forget the session' }] },
    claimed: [{ id: 'aaaa1111', active: true }],
    expected: [{ session: 'dddd4444-full', why: 'failed', reason: 'atc did not forget the session' }],
  },
  {
    name: 'each session once, as pinned, when it is both pinned and failed',
    wrapUp: {
      forgotten: [],
      destroyed: [],
      kept: [{ id: 'aaaa1111', reason: 'pinned in atc' }],
      failed: [
        { id: 'aaaa1111', reason: 'unpin: invented' },
        { id: 'bbbb2222', reason: 'unpin: invented' },
        { id: 'bbbb2222', reason: 'atc did not forget the session' },
      ],
    },
    claimed: [
      { id: 'aaaa1111', active: true },
      { id: 'bbbb2222', active: true },
    ],
    expected: [
      { session: 'aaaa1111', why: 'pinned' },
      { session: 'bbbb2222', why: 'failed', reason: 'unpin: invented' },
    ],
  },
])('it picks $name', (row) => {
  expect(pickSessionsToClose(row.wrapUp, 'GEO-51', row.claimed)).toStrictEqual(row.expected);
});
