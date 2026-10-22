import { expect, test } from 'bun:test';
import { buildMockSha } from './build-mock-sha.ts';
import { buildStubSourceGH } from './build-stub-source-gh.ts';

test('it answers a merge commit, a compare and a PR file list, and records each call', async () => {
  const sha = buildMockSha(7);
  const calls: string[] = [];
  const run = buildStubSourceGH({ shas: { 'kettle#7': sha }, contains: { 'v1.0.0': [sha] }, files: { 'kettle#7': ['a/b.ts'] } }, calls);

  const view = await run(['gh', 'pr', 'view', '7', '-R', 'zgeoff/kettle', '--json', 'mergeCommit'], {});
  const compare = await run(['gh', 'api', `repos/zgeoff/kettle/compare/${sha}...v1.0.0`, '--jq', '.status'], {});
  const files = await run(['gh', 'api', '--paginate', 'repos/zgeoff/kettle/pulls/7/files?per_page=100', '--jq', '.[] | [.filename, .previous_filename // empty] | @tsv'], {});

  expect(JSON.parse(view.stdout)).toStrictEqual({ mergeCommit: { oid: sha } });
  expect(compare.stdout).toBe('ahead\n');
  expect(files.stdout).toBe('a/b.ts\n');
  expect(calls).toHaveLength(3);
});

test('it answers behind for a tag that does not hold the commit, and fails an unknown call', async () => {
  const sha = buildMockSha(7);
  const run = buildStubSourceGH({ shas: {}, contains: {} }, []);

  const compare = await run(['gh', 'api', `repos/zgeoff/kettle/compare/${sha}...v2.0.0`, '--jq', '.status'], {});
  const unknown = await run(['gh', 'repo', 'list'], {});

  expect(compare.stdout).toBe('behind\n');
  expect(unknown.code).toBe(1);
});

test('it round-trips a release-please config through base64 and fails a repo with none', async () => {
  const sha = buildMockSha(7);
  const run = buildStubSourceGH({ shas: {}, contains: {}, config: { kettle: { packages: { '.': { component: 'kettle' } } } } }, []);

  const found = await run(['gh', 'api', `repos/zgeoff/kettle/contents/release-please-config.json?ref=${sha}`, '--jq', '.content'], {});
  const missing = await run(['gh', 'api', `repos/zgeoff/other/contents/release-please-config.json?ref=${sha}`, '--jq', '.content'], {});

  expect(JSON.parse(Buffer.from(found.stdout, 'base64').toString('utf8'))).toStrictEqual({ packages: { '.': { component: 'kettle' } } });
  expect(missing.code).toBe(1);
});

test('it answers a compare with a head GitHub does not know as gh does a 404', async () => {
  const sha = buildMockSha(7);
  const run = buildStubSourceGH({ shas: {}, contains: {}, unknownHeads: [buildMockSha(8)] }, []);

  const compare = await run(['gh', 'api', `repos/zgeoff/kettle/compare/${sha}...${buildMockSha(8)}`, '--jq', '.status'], {});

  expect(compare).toStrictEqual({ code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' });
});
