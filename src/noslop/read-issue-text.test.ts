import { expect, test } from 'bun:test';
import type { LinearCall } from '../linear/types.ts';
import { readIssueText } from './read-issue-text.ts';

function buildLinear(issue: { identifier: string; title: string; description: string | null } | null): { call: LinearCall; asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    call: (_query, variables) => {
      asked.push(variables);
      return Promise.resolve({ issue });
    },
  };
}

test('it reads the issue title and description into one text', async () => {
  const linear = buildLinear({ identifier: 'GEO-12', title: 'Mend the kettle', description: 'It never boils.' });

  await expect(readIssueText(linear.call, 'GEO-12')).resolves.toBe('# GEO-12: Mend the kettle\n\nIt never boils.\n');
  expect(linear.asked).toStrictEqual([{ id: 'GEO-12' }]);
});

test('it throws a Linear error when the answer is not an issue', async () => {
  await expect(readIssueText(() => Promise.resolve({ issue: { identifier: 'GEO-12', title: 7, description: null } }), 'GEO-12')).rejects.toMatchObject({ code: 'linear_failed' });
});
