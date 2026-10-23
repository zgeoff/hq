import { expect, test } from 'bun:test';
import { buildStubSourceGH } from '../../test/build-stub-source-gh.ts';
import { readChangedFiles } from './read-changed-files.ts';

test('it lists both paths of a renamed file', async () => {
  const run = buildStubSourceGH({ shas: {}, contains: {}, files: { 'kettle#5': ['nixos/hosts/kettle.nix', 'docs/new.md\tnixos/old.nix'] } }, []);

  const files = await readChangedFiles(run, 'kettle', '5');

  expect(files).toStrictEqual(['nixos/hosts/kettle.nix', 'docs/new.md', 'nixos/old.nix']);
});

test('it lists no file for a PR that changes none', async () => {
  const run = buildStubSourceGH({ shas: {}, contains: {}, files: { 'kettle#5': [] } }, []);

  const files = await readChangedFiles(run, 'kettle', '5');

  expect(files).toStrictEqual([]);
});

test("it refuses a PR whose file list fills GitHub's 3000-file limit", async () => {
  const run = buildStubSourceGH({ shas: {}, contains: {}, files: { 'kettle#5': Array.from({ length: 3000 }, (_, index) => `docs/page-${index}.md`) } }, []);

  await expect(readChangedFiles(run, 'kettle', '5')).rejects.toMatchObject({ code: 'too_many_files', message: "kettle#5 lists 3000 files, GitHub's limit, so its changed files are unknown" });
});
