import { expect, test } from 'bun:test';
import type { StoredEvent } from '../read-events.ts';
import { findCloseClaim } from './find-close-claim.ts';

test.each<{ name: string; state: string | null; events: StoredEvent[]; ownSeqs: number[]; expected: number | null }>([
  {
    name: 'a claim this pass made a minute ago',
    state: 'done',
    events: [{ seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:59:00Z', data: '{"sessions":[]}' }],
    ownSeqs: [7],
    expected: 7,
  },
  {
    name: 'no claim another pass made a minute ago',
    state: 'done',
    events: [{ seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:59:00Z', data: '{"sessions":[]}' }],
    ownSeqs: [],
    expected: null,
  },
  {
    name: 'a claim another pass made eleven minutes ago',
    state: 'done',
    events: [{ seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:49:00Z', data: '{"sessions":[]}' }],
    ownSeqs: [],
    expected: 7,
  },
  {
    name: 'no claim with a result',
    state: 'done',
    events: [
      { seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:49:00Z', data: '{"sessions":[]}' },
      { seq: 8, action: 'design-done-close-result', actor: 'hq-lanes', at: '2026-10-21T01:50:00Z', data: '{}' },
    ],
    ownSeqs: [7],
    expected: null,
  },
  {
    name: 'no claim followed by a state change',
    state: 'done',
    events: [
      { seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:49:00Z', data: '{"sessions":[]}' },
      { seq: 8, action: 'state', actor: 'hq-lanes', at: '2026-10-21T01:50:00Z', data: '{}' },
    ],
    ownSeqs: [7],
    expected: null,
  },
  {
    name: 'no claim followed by a move to the build run',
    state: 'done',
    events: [
      { seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:49:00Z', data: '{"sessions":[]}' },
      { seq: 8, action: 'design-to-build', actor: 'delivery-bot', at: '2026-10-21T01:50:00Z', data: '{}' },
    ],
    ownSeqs: [7],
    expected: null,
  },
  {
    name: 'no claim on a run that is no longer done',
    state: 'working',
    events: [{ seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:49:00Z', data: '{"sessions":[]}' }],
    ownSeqs: [7],
    expected: null,
  },
  {
    name: 'the later of two claims',
    state: 'done',
    events: [
      { seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:30:00Z', data: '{"sessions":[]}' },
      { seq: 9, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:49:00Z', data: '{"sessions":[]}' },
    ],
    ownSeqs: [],
    expected: 9,
  },
])('#findCloseClaim gives $name', ({ state, events, ownSeqs, expected }) => {
  const claim = findCloseClaim({ issue: 'GEO-9720', state, events, at: new Date('2026-10-21T02:00:00Z'), ownSeqs: new Set(ownSeqs) });

  expect(claim?.seq ?? null).toBe(expected);
});

test('#findCloseClaim gives the sessions the claim recorded', () => {
  const events = [{ seq: 7, action: 'design-done-close', actor: 'hq-lanes', at: '2026-10-21T01:59:00Z', data: '{"sessions":[{"id":"0000b001","active":true}]}' }];

  const claim = findCloseClaim({ issue: 'GEO-9720', state: 'done', events, at: new Date('2026-10-21T02:00:00Z'), ownSeqs: new Set([7]) });

  expect(claim).toStrictEqual({ seq: 7, issue: 'GEO-9720', sessions: [{ id: '0000b001', active: true }] });
});
