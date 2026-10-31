import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setMeta } from '../db/set-meta.ts';
import { openDb } from '../db/open-db.ts';
import { readNoslopSettings } from './read-noslop-settings.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-noslop-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it reads the repos noslop reviews from the db', () => {
  const ctx = setupTest();
  const path = join(ctx.root, 'hq.db');
  const db = openDb(path);
  setMeta(db, 'noslop', JSON.stringify({ repos: ['kettle'], sha: null, caps: {} }));
  db.close();

  expect(readNoslopSettings(path)).toStrictEqual({ repos: ['kettle'], sha: null, caps: {} });
});

test('it gives empty settings and creates nothing for a db that is not there', () => {
  const ctx = setupTest();
  const path = join(ctx.root, 'absent', 'hq.db');

  expect(readNoslopSettings(path)).toStrictEqual({ repos: [], sha: null, caps: {} });
  expect(existsSync(join(ctx.root, 'absent'))).toBe(false);
});

test('it does not write to the db it reads', () => {
  const ctx = setupTest();
  const path = join(ctx.root, 'hq.db');
  openDb(path).close();

  readNoslopSettings(path);

  const db = new Database(path, { readonly: true });
  expect(db.query('SELECT count(*) AS n FROM meta WHERE key = ?').get('noslop')).toStrictEqual({ n: 0 });
  db.close();
});
