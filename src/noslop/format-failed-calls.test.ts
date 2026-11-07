import { expect, test } from 'bun:test';
import { formatFailedCalls } from './format-failed-calls.ts';

test.each([
  [
    'an empty reason after the colon',
    [
      { id: 'architecture', reason: 'codex exited 1 on call architecture: ' },
      { id: 'security', reason: 'codex exited 1 on call security: ' },
    ],
    '2 noslop call(s) failed: codex exited 1: noslop gave no error text (architecture, security)',
  ],
  ['a reason with text', [{ id: 'tests', reason: 'codex exited 2 on call tests: stream disconnected' }], '1 noslop call(s) failed: codex exited 2: stream disconnected (tests)'],
  [
    'two different reasons',
    [
      { id: 'tests', reason: 'codex exited 2 on call tests: stream disconnected' },
      { id: 'intent', reason: 'call timed out after 600000 ms' },
    ],
    '2 noslop call(s) failed: codex exited 2: stream disconnected (tests); call timed out after 600000 ms (intent)',
  ],
  ['a call with no reason or id', [{}], '1 noslop call(s) failed: noslop gave no error text (unnamed)'],
])('it names each distinct reason for %s', (_case, failedCalls, said) => {
  expect(formatFailedCalls(failedCalls)).toBe(said);
});
