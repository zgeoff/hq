import { expect, mock, test } from 'bun:test';
import { buildStubGitHubFactsRunner } from './build-stub-github-facts-runner.ts';

test('it answers a listed PR view from its table and records the command', async () => {
  const calls: string[] = [];
  const run = buildStubGitHubFactsRunner({ views: { 'kettle#5': '{"state":"OPEN"}' }, calls });

  const result = await run(['gh', 'pr', 'view', '5', '-R', 'zgeoff/kettle', '--json', 'state']);

  expect(result).toStrictEqual({ code: 0, stdout: '{"state":"OPEN"}', stderr: '' });
  expect(calls).toStrictEqual(['gh pr view 5 -R zgeoff/kettle --json state']);
});

test('it fails a PR view that is not listed, as gh does for a PR it cannot find', async () => {
  const run = buildStubGitHubFactsRunner({ views: { 'kettle#5': '{}' } });

  const result = await run(['gh', 'pr', 'view', '6', '-R', 'zgeoff/kettle', '--json', 'state']);

  expect(result).toStrictEqual({ code: 1, stdout: '', stderr: 'invented: no such PR' });
});

test('it answers the search with the text given, and fails it when none is given', async () => {
  const withText = buildStubGitHubFactsRunner({ search: '[]' });
  const without = buildStubGitHubFactsRunner({});

  const found = await withText(['gh', 'search', 'prs']);
  const failed = await without(['gh', 'search', 'prs']);

  expect(found).toStrictEqual({ code: 0, stdout: '[]', stderr: '' });
  expect(failed).toStrictEqual({ code: 1, stdout: '', stderr: 'invented: search failed' });
});

test('it fails any other command', async () => {
  const run = buildStubGitHubFactsRunner({});

  const result = await run(['gh', 'api', 'user']);

  expect(result).toStrictEqual({ code: 1, stdout: '', stderr: 'invented: unexpected gh api user' });
});

test('it runs the view hook for a PR view and not for a search', async () => {
  const onView = mock(() => {});
  const run = buildStubGitHubFactsRunner({ onView, search: '[]' });

  await run(['gh', 'search', 'prs']);
  await run(['gh', 'pr', 'view', '5', '-R', 'zgeoff/kettle', '--json', 'state']);

  expect(onView).toHaveBeenCalledTimes(1);
});

test('it hands any other command to the fallback when one is given', async () => {
  const fallback = mock(() => Promise.resolve({ code: 0, stdout: 'invented capacity', stderr: '' }));
  const run = buildStubGitHubFactsRunner({ fallback });

  const result = await run(['gh', 'api', 'user']);

  expect(result).toStrictEqual({ code: 0, stdout: 'invented capacity', stderr: '' });
  expect(fallback).toHaveBeenCalledTimes(1);
});

test('it sends a gh pr command other than view to the fallback', async () => {
  const fallback = mock(() => Promise.resolve({ code: 0, stdout: 'listed', stderr: '' }));
  const run = buildStubGitHubFactsRunner({ views: { 'kettle#5': '{}' }, fallback });

  const result = await run(['gh', 'pr', 'list', '-R', 'zgeoff/kettle']);

  expect(result).toStrictEqual({ code: 0, stdout: 'listed', stderr: '' });
  expect(fallback).toHaveBeenCalledTimes(1);
});
