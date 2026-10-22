import { expect, test } from 'bun:test';
import { buildStubFindings } from './build-stub-findings.ts';

test('it prints one finding in the given state as noslop does', () => {
  expect(buildStubFindings('deferred')).toStrictEqual({
    code: 0,
    stdout: '{"findings":[{"id":"aaaa","path":"kettle.ts","severity":"high","state":"deferred","author":"zgeoff"}]}',
    stderr: '',
  });
});
