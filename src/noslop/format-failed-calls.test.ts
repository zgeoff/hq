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
      { id: 'intent', reason: 'codex timed out after 600012 ms on call intent' },
    ],
    '2 noslop call(s) failed: codex exited 2: stream disconnected (tests); codex timed out (intent)',
  ],
  [
    'timeouts of different lengths',
    [
      { id: 'security', reason: 'claude timed out after 600001 ms on call security' },
      { id: 'reuse', reason: 'claude timed out after 600002 ms on call reuse' },
    ],
    '2 noslop call(s) failed: claude timed out (security, reuse)',
  ],
  ['a call with no reason or id', [{}], '1 noslop call(s) failed: noslop gave no error text (unnamed)'],
])('it names each distinct reason for %s', (_case, failedCalls, said) => {
  expect(formatFailedCalls(failedCalls)).toBe(said);
});
