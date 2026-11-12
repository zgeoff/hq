import { expect, test } from 'bun:test';
import { pickIssueSource } from './pick-issue-source.ts';

test.each([
  ['an old source', 'live check', false, 'live check'],
  ['a fleet session', 'z-kettle', false, 'z-kettle'],
  ['a session that left the fleet', 'z-retired', false, 'agent'],
  ['a recorded followup with a session mark', 'z-kettle', true, 'review'],
  ['a retired name that fleet.json forwards to a fleet session', 'z-refine', false, 'z-triage'],
] as const)('it picks the issue source for %s', (_name, stored, isRecorded, expected) => {
  expect<string>(pickIssueSource(stored, isRecorded, ['z-kettle', 'z-triage'])).toBe(expected);
});
