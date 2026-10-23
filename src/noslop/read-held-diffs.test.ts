import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubPRRepo } from '../../test/create-stub-pr-repo.ts';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { overrideEnv } from '../config/override-env.ts';
import { buildRenameKey } from './build-rename-key.ts';
import { realRunner } from '../runner/real-runner.ts';
import { proveMechanical } from './prove-mechanical.ts';
import { readHeldDiffs } from './read-held-diffs.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-held-diffs-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_PROJECTS', join(root, 'projects')));
  onTestFinished(overrideEnv('HQ_REPOS', join(root, 'repos')));
  return { root, fake: buildFakeRunner({ realGit: true }) };
}

test('it reads the diff of a held file against the merge base, not against the moved main', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Boil.\nPour.\n' }], change: { 'AGENTS.md': 'Steam.\nPour.\n' }, baseAfter: { 'AGENTS.md': 'Boil.\nPour.\nServe.\n' } });

  const read = await readHeldDiffs({ run: ctx.fake.run, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, head: stub.head, paths: ['AGENTS.md'] });

  expect(read.files).toStrictEqual([{ path: 'AGENTS.md', diff: expect.stringContaining('@@ -1 +1 @@\n-Boil.\n+Steam.\n') }]);
});

test('it keeps a line moved two lines down as two hunks when the clone asks git to join near hunks', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Fill the kettle.\nBoil.\nPour.\nServe.\n' }], change: { 'AGENTS.md': 'Boil.\nPour.\nFill the kettle.\nServe.\n' } });
  await realRunner(['git', 'config', 'diff.interHunkContext', '3'], { cwd: stub.directory });
  await realRunner(['git', 'config', 'color.diff', 'always'], { cwd: stub.directory });

  const read = await readHeldDiffs({ run: ctx.fake.run, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, head: stub.head, paths: ['AGENTS.md'] });

  expect(read.files).toStrictEqual([{ path: 'AGENTS.md', diff: expect.stringContaining('@@ -1 +0,0 @@\n-Fill the kettle.\n@@ -3,0 +3 @@ Pour.\n+Fill the kettle.\n') }]);
  expect(proveMechanical(read.files, read.facts)).toMatchObject({ pass: false });
});

test('it reads a held file whose name starts with pathspec magic as that file alone', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ ':(attr:kettle)x/AGENTS.md': 'Boil.\n' }], change: { ':(attr:kettle)x/AGENTS.md': 'Pour it all away.\n' } });

  const read = await readHeldDiffs({ run: ctx.fake.run, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, head: stub.head, paths: [':(attr:kettle)x/AGENTS.md'] });

  expect(read.files).toStrictEqual([{ path: ':(attr:kettle)x/AGENTS.md', diff: expect.stringContaining('-Boil.\n+Pour it all away.\n') }]);
});

test('it reads the blobs of a file the PR moved', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({
    root: ctx.root,
    repo: 'widgets',
    pr: 7,
    history: [{ 'skills/kettle/SKILL.md': 'See [care](refs/old.md).\n', 'skills/kettle/refs/old.md': 'Descale monthly.\n' }],
    change: { 'skills/kettle/SKILL.md': 'See [care](refs/new.md).\n', 'skills/kettle/refs/old.md': null, 'skills/kettle/refs/new.md': 'Descale monthly.\n' },
  });

  const read = await readHeldDiffs({ run: ctx.fake.run, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, head: stub.head, paths: ['skills/kettle/SKILL.md'] });

  expect(read.facts.baseBlobs.get('skills/kettle/refs/old.md')).toBe(read.facts.headBlobs.get('skills/kettle/refs/new.md'));
  expect(read.facts.headBlobs.get('skills/kettle/refs/old.md')).toBeNull();
});

test('it finds a rename that main made before the PR branched', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({
    root: ctx.root,
    repo: 'widgets',
    pr: 7,
    history: [
      { 'skills/kettle/SKILL.md': 'See [care](refs/old.md).\n', 'skills/kettle/refs/old.md': 'Descale monthly, then rinse the jug twice.\n' },
      { 'skills/kettle/refs/old.md': null, 'skills/kettle/refs/new.md': 'Descale monthly, then rinse the jug twice.\n' },
    ],
    change: { 'skills/kettle/SKILL.md': 'See [care](refs/new.md).\n' },
  });

  const read = await readHeldDiffs({ run: ctx.fake.run, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, head: stub.head, paths: ['skills/kettle/SKILL.md'] });

  expect([...read.facts.renames]).toStrictEqual([buildRenameKey('skills/kettle/refs/old.md', 'skills/kettle/refs/new.md')]);
});

test('it refuses to read when the pull head is not the head asked for', async () => {
  const ctx = setupTest();
  await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Boil.\n' }], change: { 'AGENTS.md': 'Steam.\n' } });

  await expect(readHeldDiffs({ run: ctx.fake.run, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed', paths: ['AGENTS.md'] })).rejects.toThrow('does not hold the PR\'s head f00dfee');
});

test.each<{ name: string; history: Record<string, string | null>[]; change: Record<string, string | null> }>([
  {
    name: 'a move the PR makes',
    history: [{ 'docs/old.md': 'Steep for four minutes.\n', 'skills/kettle/SKILL.md': 'See [tea](../../docs/old.md).\n' }],
    change: { 'docs/old.md': null, 'docs/caf\u00E9.md': 'Steep for four minutes.\n', 'skills/kettle/SKILL.md': 'See [tea](../../docs/caf\u00E9.md).\n' },
  },
  {
    name: 'a move the base branch made before the PR',
    history: [{ 'docs/old.md': 'Steep for four minutes.\n', 'skills/kettle/SKILL.md': 'See [tea](../../docs/old.md).\n' }, { 'docs/old.md': null, 'docs/caf\u00E9.md': 'Steep for four minutes.\n' }],
    change: { 'skills/kettle/SKILL.md': 'See [tea](../../docs/caf\u00E9.md).\n' },
  },
])('it proves $name to a non-ASCII path', async (row) => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: row.history, change: row.change });

  const read = await readHeldDiffs({ run: ctx.fake.run, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, head: stub.head, paths: ['skills/kettle/SKILL.md'] });

  expect(proveMechanical(read.files, read.facts)).toStrictEqual({ pass: true, files: ['skills/kettle/SKILL.md'], lines: 1 });
});
