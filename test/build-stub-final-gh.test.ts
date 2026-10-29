import { expect, test } from 'bun:test';
import { buildMockSha } from './build-mock-sha.ts';
import { buildStubFinalGH } from './build-stub-final-gh.ts';

test('it lists the PR commits, resolves a listed short sha, and records each call', async () => {
  const first = buildMockSha(1);
  const second = buildMockSha(2);
  const calls: string[] = [];
  const run = buildStubFinalGH({ commits: [first, second], lookups: { abc1234: second } }, calls);

  const list = await run(['gh', 'api', 'repos/zgeoff/kettle/pulls/7/commits', '--paginate', '--jq', '.[].sha']);
  const found = await run(['gh', 'api', 'repos/zgeoff/kettle/commits/abc1234', '--jq', '.sha']);
  const missing = await run(['gh', 'api', 'repos/zgeoff/kettle/commits/ffff000', '--jq', '.sha']);

  expect(list.stdout).toBe(`${first}\n${second}\n`);
  expect(found.stdout).toBe(`${second}\n`);
  expect(missing.stderr).toBe('gh: Not Found (HTTP 404)');
  expect(calls).toHaveLength(3);
});

test('it fails the reads it is told to fail and any call it does not know', async () => {
  const run = buildStubFinalGH({ commits: 'fault', lookupFault: true }, []);

  const list = await run(['gh', 'api', 'repos/zgeoff/kettle/pulls/7/commits', '--paginate', '--jq', '.[].sha']);
  const lookup = await run(['gh', 'api', 'repos/zgeoff/kettle/commits/abc1234', '--jq', '.sha']);
  const unknown = await run(['gh', 'repo', 'list']);

  expect(list.code).toBe(1);
  expect(lookup.code).toBe(1);
  expect(unknown.code).toBe(1);
});
