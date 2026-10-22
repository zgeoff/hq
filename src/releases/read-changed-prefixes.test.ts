import { expect, test } from 'bun:test';
import type { Runner } from '../runner/types.ts';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubSourceGH } from '../../test/build-stub-source-gh.ts';
import { readChangedPrefixes } from './read-changed-prefixes.ts';

function setupTest(): Runner {
  return () => Promise.resolve({ code: 0, stdout: '\n', stderr: '' });
}

test('it refuses an empty release config', async () => {
  await expect(readChangedPrefixes(setupTest(), 'tools', '5', buildMockSha(5))).rejects.toMatchObject({ code: 'bad_config', message: 'release-please-config.json of tools is empty' });
});

test('it finds a package changed only by a file past the first hundred', async () => {
  const files = [...Array.from({ length: 150 }, (_, index) => `docs/page-${index}.md`), 'packages/alpha/a.ts'];
  const run = buildStubSourceGH({ shas: {}, contains: {}, config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } }, files: { 'tools#5': files } }, []);

  const prefixes = await readChangedPrefixes(run, 'tools', '5', buildMockSha(5));

  expect(prefixes).toStrictEqual(['alpha@']);
});

test('it counts the package a renamed file left, so a move out of a package waits for that package', async () => {
  const run = buildStubSourceGH({ shas: {}, contains: {}, config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } }, files: { 'tools#5': ['docs/a.ts\tpackages/alpha/a.ts'] } }, []);

  const prefixes = await readChangedPrefixes(run, 'tools', '5', buildMockSha(5));

  expect(prefixes).toStrictEqual(['alpha@']);
});

test('it counts both packages of a file moved between them', async () => {
  const run = buildStubSourceGH({ shas: {}, contains: {}, config: { tools: { packages: { 'packages/alpha': { component: 'alpha' }, 'packages/beta': { component: 'beta' } } } }, files: { 'tools#5': ['packages/beta/a.ts\tpackages/alpha/a.ts'] } }, []);

  const prefixes = await readChangedPrefixes(run, 'tools', '5', buildMockSha(5));

  expect(prefixes).toStrictEqual(['alpha@', 'beta@']);
});

test('it counts a renamed file once toward the 3000-file limit', async () => {
  const files = Array.from({ length: 2999 }, (_, index) => `docs/page-${index}.md\tdocs/old-${index}.md`);
  const run = buildStubSourceGH({ shas: {}, contains: {}, config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } }, files: { 'tools#5': files } }, []);

  const prefixes = await readChangedPrefixes(run, 'tools', '5', buildMockSha(5));

  expect(prefixes).toStrictEqual([]);
});

test("it refuses a PR whose file list fills GitHub's 3000-file limit, as its changed packages are unknown", async () => {
  const files = Array.from({ length: 3000 }, (_, index) => `docs/page-${index}.md`);
  const run = buildStubSourceGH({ shas: {}, contains: {}, config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } }, files: { 'tools#5': files } }, []);

  await expect(readChangedPrefixes(run, 'tools', '5', buildMockSha(5))).rejects.toMatchObject({ code: 'too_many_files', message: "tools#5 lists 3000 files, GitHub's limit, so its changed packages are unknown" });
});
