import { expect, test } from 'bun:test';
import { buildMockSha } from './build-mock-sha.ts';
import { buildStubBriefGH } from './build-stub-brief-gh.ts';

test('it answers a ref with its commit sha and a listed file with its raw text, and records each call', async () => {
  const sha = buildMockSha(3);
  const calls: string[] = [];
  const run = buildStubBriefGH({ commits: { main: sha }, files: { 'agent-kit/kettle.md': 'boil it\n' } }, calls);

  const commit = await run(['gh', 'api', 'repos/zgeoff/hq/commits/main', '--jq', '.sha']);
  const file = await run(['gh', 'api', `repos/zgeoff/hq/contents/agent-kit/kettle.md?ref=${sha}`, '-H', 'Accept: application/vnd.github.raw']);

  expect(commit).toStrictEqual({ code: 0, stdout: `${sha}\n`, stderr: '' });
  expect(file).toStrictEqual({ code: 0, stdout: 'boil it\n', stderr: '' });
  expect(calls).toStrictEqual(['gh api repos/zgeoff/hq/commits/main --jq .sha', `gh api repos/zgeoff/hq/contents/agent-kit/kettle.md?ref=${sha} -H Accept: application/vnd.github.raw`]);
});

test('it answers an unlisted ref, a file not listed and a file at an unknown commit with gh 404 text', async () => {
  const sha = buildMockSha(3);
  const run = buildStubBriefGH({ commits: { main: sha }, files: { 'agent-kit/kettle.md': 'boil it\n' } }, []);

  const ref = await run(['gh', 'api', 'repos/zgeoff/hq/commits/gone', '--jq', '.sha']);
  const missing = await run(['gh', 'api', `repos/zgeoff/hq/contents/agent-kit/lid.md?ref=${sha}`, '-H', 'Accept: application/vnd.github.raw']);
  const unknownCommit = await run(['gh', 'api', `repos/zgeoff/hq/contents/agent-kit/kettle.md?ref=${buildMockSha(9)}`, '-H', 'Accept: application/vnd.github.raw']);

  expect([ref.code, missing.code, unknownCommit.code]).toStrictEqual([1, 1, 1]);
  expect([ref.stderr, missing.stderr, unknownCommit.stderr]).toStrictEqual(['gh: Not Found (HTTP 404)\n', 'gh: Not Found (HTTP 404)\n', 'gh: Not Found (HTTP 404)\n']);
});

test('it fails a call it does not know', async () => {
  const run = buildStubBriefGH({ commits: {}, files: {} }, []);

  const result = await run(['gh', 'repo', 'list']);

  expect(result).toStrictEqual({ code: 1, stdout: '', stderr: 'unexpected gh repo list' });
});
