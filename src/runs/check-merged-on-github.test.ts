import { expect, test } from 'bun:test';
import { checkMergedOnGitHub } from './check-merged-on-github.ts';

test.each([
  { name: 'a number', stdout: '5' },
  { name: 'a string', stdout: '"MERGED"' },
  { name: 'a list', stdout: '[]' },
  { name: 'an object with no state', stdout: '{}' },
])('it refuses a PR as unknown and not merged when gh gives $name', (testCase) => {
  expect(checkMergedOnGitHub(() => Promise.resolve({ code: 0, stdout: testCase.stdout, stderr: '' }), 'widgets#12')).rejects.toMatchObject({
    code: 'not_merged',
    message: 'widgets#12 is unknown on GitHub, not merged; hq leaves it open',
  });
});

test('it refuses a PR as unreadable when gh gives JSON null', () => {
  expect(checkMergedOnGitHub(() => Promise.resolve({ code: 0, stdout: 'null', stderr: '' }), 'widgets#12')).rejects.toMatchObject({
    code: 'github_unreachable',
    message: 'gh gave no JSON for widgets#12; hq leaves it open',
  });
});
