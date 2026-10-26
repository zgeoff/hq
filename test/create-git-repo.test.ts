import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitRepo } from './create-git-repo.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-git-repo-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory: join(directory, 'widgets') };
}

test('it makes an empty repo on main, and a commit writes its files and gives the new head', async () => {
  const ctx = setupTest();
  const repo = await createGitRepo(ctx.directory);

  const head = await repo.commit({ 'kettle.txt': 'boil\n', 'lid.txt': 'on\n' }, 'start');

  expect(head).toBe(await repo.git('rev-parse', 'main'));
  expect(await repo.git('log', '-1', '--format=%an <%ae> %s')).toBe('Kettle <kettle@example.com> start');
  expect(await repo.git('show', '--name-only', '--format=', 'HEAD')).toBe('kettle.txt\nlid.txt');
  expect(readFileSync(join(ctx.directory, 'kettle.txt'), 'utf8')).toBe('boil\n');
});

test('a git command that fails throws with what git said', async () => {
  const ctx = setupTest();
  const repo = await createGitRepo(ctx.directory);

  await expect(repo.git('rev-parse', 'no-such-branch')).rejects.toThrow(/git rev-parse no-such-branch failed: .*no-such-branch/su);
});
