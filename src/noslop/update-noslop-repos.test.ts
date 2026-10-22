import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/open-db.ts';
import { setMeta } from '../db/set-meta.ts';
import { isNoslopListed } from './is-noslop-listed.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import { updateNoslopRepos } from './update-noslop-repos.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  return { base, db };
}

test('it adds repos sorted and repeating a change changes nothing', () => {
  const ctx = setupTest();

  updateNoslopRepos(ctx.db, 'on', ['tools', 'atc']);
  updateNoslopRepos(ctx.db, 'on', ['atc']);

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: ['atc', 'tools'], sha: null });
  expect(isNoslopListed(loadNoslopSettings(ctx.db), 'zgeoff', 'atc')).toBe(true);
  expect(isNoslopListed(loadNoslopSettings(ctx.db), 'someone-else', 'atc')).toBe(false);
});

test('it removes repos and ignores one that was never listed', () => {
  const ctx = setupTest();
  updateNoslopRepos(ctx.db, 'on', ['atc', 'tools']);

  updateNoslopRepos(ctx.db, 'off', ['tools', 'tools', 'nothing']);

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: ['atc'], sha: null });
});

test('it keeps the pinned commit when the list changes', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'noslop', JSON.stringify({ repos: [], sha: 'abc1234' }));

  updateNoslopRepos(ctx.db, 'on', ['atc']);

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: ['atc'], sha: 'abc1234' });
});

test.each([
  ['an owner and a repo', ['zgeoff/atc']],
  ['a path', ['../etc']],
  ['no repo at all', []],
])('it refuses to list %s', (_label, names) => {
  const ctx = setupTest();

  expect(() => updateNoslopRepos(ctx.db, 'on', names)).toThrow(/bare repo name|at least one repo/u);
  expect(loadNoslopSettings(ctx.db).repos).toStrictEqual([]);
});

test('it keeps a repo another hq process turns on while this change waits for the database', async () => {
  const ctx = setupTest();
  const other = Bun.spawn(
    [
      'bun',
      '-e',
      "const { Database } = require('bun:sqlite'); const db = new Database(process.env.KETTLE_DB); db.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE'); db.query(\"INSERT INTO meta (key, value) VALUES ('noslop', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value\").run(JSON.stringify({ repos: ['widgets'], sha: null })); console.log('held'); await Bun.sleep(300); db.exec('COMMIT');",
    ],
    { env: { ...Bun.env, KETTLE_DB: join(ctx.base, 'hq.db') }, stdout: 'pipe' },
  );
  onTestFinished(() => other.kill());
  const reader = other.stdout.getReader();
  let said = '';
  while (!said.includes('held')) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    said += new TextDecoder().decode(chunk.value);
  }

  updateNoslopRepos(ctx.db, 'on', ['atc']);
  await other.exited;

  expect(loadNoslopSettings(ctx.db).repos).toStrictEqual(['atc', 'widgets']);
});
