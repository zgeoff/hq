import { expect, test } from 'bun:test';
import { buildMockSha } from './build-mock-sha.ts';
import { buildStubFinalGH } from './build-stub-final-gh.ts';

test('it lists the commits of a PR one sha a line', async () => {
  const first = buildMockSha(1);
  const second = buildMockSha(2);
  const run = buildStubFinalGH({ commits: [first, second] }, []);

  const list = await run(['gh', 'api', 'repos/zgeoff/kettle/pulls/7/commits', '--paginate', '--jq', '.[].sha']);

  expect(list).toStrictEqual({ code: 0, stdout: `${first}\n${second}\n`, stderr: '' });
});

test('it resolves a short sha it lists to its full sha', async () => {
  const full = buildMockSha(2);
  const run = buildStubFinalGH({ commits: [], lookups: { abc1234: full } }, []);

  const found = await run(['gh', 'api', 'repos/zgeoff/kettle/commits/abc1234', '--jq', '.sha']);

  expect(found).toStrictEqual({ code: 0, stdout: `${full}\n`, stderr: '' });
});

test('it answers a short sha it does not list as GitHub answers a missing commit', async () => {
  const run = buildStubFinalGH({ commits: [], lookups: {} }, []);

  const missing = await run(['gh', 'api', 'repos/zgeoff/kettle/commits/ffff000', '--jq', '.sha']);

  expect(missing).toStrictEqual({ code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' });
});

test('it records the line of each call', async () => {
  const calls: string[] = [];
  const run = buildStubFinalGH({ commits: [] }, calls);

  await run(['gh', 'api', 'repos/zgeoff/kettle/commits/abc1234', '--jq', '.sha']);

  expect(calls).toStrictEqual(['gh api repos/zgeoff/kettle/commits/abc1234 --jq .sha']);
});

test('it fails the commit list read when told to', async () => {
  const run = buildStubFinalGH({ commits: 'fault' }, []);

  const list = await run(['gh', 'api', 'repos/zgeoff/kettle/pulls/7/commits', '--paginate', '--jq', '.[].sha']);

  expect(list).toStrictEqual({ code: 1, stdout: '', stderr: 'gh: Bad Gateway (HTTP 502)' });
});

test('it fails the commit lookup when told to', async () => {
  const run = buildStubFinalGH({ commits: [], lookupFault: true }, []);

  const lookup = await run(['gh', 'api', 'repos/zgeoff/kettle/commits/abc1234', '--jq', '.sha']);

  expect(lookup).toStrictEqual({ code: 1, stdout: '', stderr: 'gh: Bad Gateway (HTTP 502)' });
});

test('it fails a call it does not know', async () => {
  const run = buildStubFinalGH({ commits: [] }, []);

  const unknown = await run(['gh', 'repo', 'list']);

  expect(unknown).toStrictEqual({ code: 1, stdout: '', stderr: 'invented: unknown call' });
});
