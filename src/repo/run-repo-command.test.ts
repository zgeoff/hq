import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createHistoryRows, createStoreRows, createStoreTables } from '../../test/create-history-databases.ts';
import { freshDb } from '../../test/helpers.ts';
import { createStoreBackup } from '../noslop/create-store-backup.ts';
import type { RunResult } from '../runner/types.ts';
import { runRepoCommand } from './run-repo-command.ts';

function runQuiet(): Promise<RunResult> {
  return Promise.resolve({ code: 1, stdout: '', stderr: '' });
}

function createDataHomeOverride(dataHome: string): () => void {
  const saved = process.env['XDG_DATA_HOME'];
  process.env['XDG_DATA_HOME'] = dataHome;
  return () => {
    if (saved === undefined) {
      delete process.env['XDG_DATA_HOME'];
    } else {
      process.env['XDG_DATA_HOME'] = saved;
    }
  };
}

function setupTest() {
  const base = freshDb();
  onTestFinished(base.cleanup);
  onTestFinished(createDataHomeOverride(`${base.dir}/xdg`));
  createStoreTables(`${base.dir}/xdg/noslop/store.sqlite`);
  return {
    ...base,
    command: (verb: string | undefined, rest: string[], dryRun = false) =>
      runRepoCommand({
        actor: 'z-stu',
        createBackup: createStoreBackup,
        db: base.db,
        dryRun,
        openStore: (file, options) => new Database(file, options),
        rest,
        run: runQuiet,
        verb,
      }),
    createHistoryRows: (repo: string, offset: number) => createHistoryRows(base.db, repo, offset),
    createStoreRows: (repo: string, offset: number) => createStoreRows(`${base.dir}/xdg/noslop/store.sqlite`, repo, offset),
  };
}

test('it prints the counts of both databases, before and after, for hq repo archive-history', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createStoreRows('hq', 0);
  {
    const out = await ctx.command('archive-history', ['hq', 'hq-archive']);
    expect(out.text).toContain('Re-keyed hq → hq-archive:');
    expect(out.text).toContain('hq.db:');
    expect(out.text).toContain('merged_prs.repo');
    expect(out.text).toContain("noslop's store:");
    expect(out.text).toContain('reviews.repo');
    expect(out.text).toMatch(/backups: .*hq\.db\.bak-archive-.*store\.sqlite\.bak-archive-/u);
  }
});

test('it prints what a dry run would leave and writes nothing', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createStoreRows('hq', 0);
  {
    const out = await ctx.command('archive-history', ['hq', 'hq-archive'], true);
    expect(out.text).toContain('Dry run: nothing changed.');
    expect(out.text).toContain('merged_prs.repo');
    expect(ctx.db.query('SELECT repo FROM merged_prs').all()).toStrictEqual([{ repo: 'hq' }]);
  }
});

test.each([
  ['archive-history', ['hq'], 'takes two repo names'],
  ['archive-history', ['hq', 'hq-archive', 'extra'], 'takes two repo names'],
  ['unarchive', ['hq', 'hq-archive'], 'unknown command: hq repo unarchive'],
  [undefined, [], 'unknown command: hq repo'],
])('it refuses hq repo %p with %p', async (verb, rest, why) => {
  const ctx = setupTest();
  await expect(ctx.command(verb, rest)).rejects.toThrow(why);
});
