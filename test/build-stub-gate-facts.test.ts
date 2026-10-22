import { expect, test } from 'bun:test';
import { buildStubGateFacts } from './build-stub-gate-facts.ts';

test('it prints the head, a zgeoff author and the checks as gh does', () => {
  expect(buildStubGateFacts({ head: 'abc123', checks: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] })).toStrictEqual({
    code: 0,
    stdout: '{"headRefOid":"abc123","author":{"login":"zgeoff","is_bot":false},"statusCheckRollup":[{"__typename":"CheckRun","name":"test","status":"COMPLETED","conclusion":"SUCCESS"}]}',
    stderr: '',
  });
});
