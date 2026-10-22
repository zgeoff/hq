import { expect, test } from 'bun:test';
import { formatChecks } from './format-checks.ts';

test('it shows checks that could not be read as unknown, with the reason', () => {
  expect(formatChecks({ checks: [], checksError: 'gh pr checks failed (1): HTTP 502', openThreads: 0 })).toStrictEqual(['== checks: unknown (gh pr checks failed (1): HTTP 502)', '== open threads: 0']);
});

test('it counts the checks that are not passing', () => {
  expect(formatChecks({ checks: [{ name: 'test', state: 'SUCCESS', bucket: 'pass' }, { name: 'lint', state: 'FAILURE', bucket: 'fail' }], checksError: null, openThreads: null })).toStrictEqual(['== checks: 2 total, 1 not passing: lint FAILURE', '== open threads: unknown']);
});
