import { expect, test } from 'bun:test';
import { pickHandedInCandidates } from './pick-handed-in-candidates.ts';

test('it picks a run whose PRs all merged with a final before the quiet time, with its rows and active ids', () => {
  const candidates = pickHandedInCandidates(
    {
      prs: [{ issue: 'GEO-9931', state: 'merged', final_sha: 'abc1234', merged_at: '2026-10-22T11:00:00Z' }],
      sessions: [
        { issue: 'GEO-9931', session_id: '0000b001', active: 1 },
        { issue: 'GEO-9931', session_id: '0000b002', active: 0 },
      ],
      lastKept: new Map(),
    },
    new Date('2026-10-22T12:00:00Z'),
    Date.parse('2026-10-22T11:30:00Z'),
  );

  expect(candidates).toStrictEqual([
    {
      issue: 'GEO-9931',
      rows: [
        { issue: 'GEO-9931', session_id: '0000b001', active: 1 },
        { issue: 'GEO-9931', session_id: '0000b002', active: 0 },
      ],
      ids: ['0000b001'],
      lastKept: null,
    },
  ]);
});

test.each([
  ['an open PR', [{ issue: 'GEO-9931', state: 'merged', final_sha: 'abc1234', merged_at: '2026-10-22T11:00:00Z' }, { issue: 'GEO-9931', state: 'open', final_sha: null, merged_at: null }]],
  ['a merged PR with no final', [{ issue: 'GEO-9931', state: 'merged', final_sha: null, merged_at: '2026-10-22T11:00:00Z' }]],
  ['a merge inside the quiet time', [{ issue: 'GEO-9931', state: 'merged', final_sha: 'abc1234', merged_at: '2026-10-22T11:45:00Z' }]],
  ['no PR', []],
])('it skips a run with %s', (_name, prs) => {
  const candidates = pickHandedInCandidates({ prs, sessions: [{ issue: 'GEO-9931', session_id: '0000b001', active: 1 }], lastKept: new Map() }, new Date('2026-10-22T12:00:00Z'), Date.parse('2026-10-22T11:30:00Z'));

  expect(candidates).toStrictEqual([]);
});

test('it skips a run with no active session', () => {
  const candidates = pickHandedInCandidates(
    { prs: [{ issue: 'GEO-9931', state: 'merged', final_sha: 'abc1234', merged_at: '2026-10-22T11:00:00Z' }], sessions: [{ issue: 'GEO-9931', session_id: '0000b001', active: 0 }], lastKept: new Map() },
    new Date('2026-10-22T12:00:00Z'),
    Date.parse('2026-10-22T11:30:00Z'),
  );

  expect(candidates).toStrictEqual([]);
});

test.each([
  ['skips', '2026-10-22T11:31:00Z', 0],
  ['picks', '2026-10-22T11:30:00Z', 1],
])('it %s a run whose wrap-up last kept a session at %s, 30 minutes being the retry wait', (_verb, keptAt, count) => {
  const candidates = pickHandedInCandidates(
    {
      prs: [{ issue: 'GEO-9931', state: 'merged', final_sha: 'abc1234', merged_at: '2026-10-22T11:00:00Z' }],
      sessions: [{ issue: 'GEO-9931', session_id: '0000b001', active: 1 }],
      lastKept: new Map([['GEO-9931', { seq: 7, action: 'handed-in-kept', actor: 'z-delivery', at: keptAt, data: '{}' }]]),
    },
    new Date('2026-10-22T12:00:00Z'),
    Date.parse('2026-10-22T11:30:00Z'),
  );

  expect(candidates).toHaveLength(count);
});
