import { Database } from 'bun:sqlite';
import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildHookedDb } from './build-hooked-db.ts';

function setupTest() {
  const db = new Database(':memory:', { strict: true });
  onTestFinished(() => db.close());
  db.exec('CREATE TABLE kettles (name TEXT)');
  return { db };
}

test('it runs the hook once, before the first query that starts with the prefix', () => {
  const ctx = setupTest();
  const seen: number[] = [];
  const hooked = buildHookedDb(ctx.db, 'INSERT INTO kettles', () => seen.push(ctx.db.query('SELECT name FROM kettles').all().length));
  hooked.query('SELECT name FROM kettles').all();

  hooked.query('INSERT INTO kettles (name) VALUES (?)').run('copper');
  hooked.query('INSERT INTO kettles (name) VALUES (?)').run('steel');

  expect(seen).toStrictEqual([0]);
  expect(ctx.db.query('SELECT name FROM kettles ORDER BY name').all()).toStrictEqual([{ name: 'copper' }, { name: 'steel' }]);
});

test('it runs no hook for a query without the prefix', () => {
  const ctx = setupTest();
  const hook = mock();
  const hooked = buildHookedDb(ctx.db, 'INSERT INTO kettles', hook);

  hooked.query('SELECT name FROM kettles').all();

  expect(hook).not.toHaveBeenCalled();
});

test('it passes other members through to the database', () => {
  const ctx = setupTest();
  const hooked = buildHookedDb(ctx.db, 'INSERT INTO kettles', mock());

  hooked.transaction(() => ctx.db.query("INSERT INTO kettles (name) VALUES ('brass')").run()).immediate();

  expect(ctx.db.query('SELECT name FROM kettles').all()).toStrictEqual([{ name: 'brass' }]);
});
