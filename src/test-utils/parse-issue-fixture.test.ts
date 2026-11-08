import { expect, test } from 'bun:test';
import { z } from 'zod';
import { parseIssueFixture } from './parse-issue-fixture.ts';

test('it parses a fixture that is a bare list of issues', () => {
  const issues = parseIssueFixture('[{"identifier":"GEO-1"},{"identifier":"GEO-2"}]', z.object({ identifier: z.string() }));

  expect(issues).toStrictEqual([{ identifier: 'GEO-1' }, { identifier: 'GEO-2' }]);
});

test('it parses a fixture that wraps its issues in an object', () => {
  const issues = parseIssueFixture('{"issues":[{"identifier":"GEO-3"}]}', z.object({ identifier: z.string() }));

  expect(issues).toStrictEqual([{ identifier: 'GEO-3' }]);
});

test('it rejects a fixture whose issues do not fit the schema', () => {
  expect(() => parseIssueFixture('[{"title":"Kettle"}]', z.object({ identifier: z.string() }))).toThrow();
});
