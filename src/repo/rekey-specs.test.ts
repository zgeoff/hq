import type { Database } from 'bun:sqlite';
import { Database as SqliteDatabase } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createStoreTables } from '../../test/create-history-databases.ts';
import { freshDb } from '../../test/helpers.ts';
import type { RekeySpec } from './rekey-specs.ts';
import { REKEY_SPECS } from './rekey-specs.ts';

// Columns that look like they could name a repo and are outside the agreed list.
const CANDIDATE = /\.(?:repo|ref|link|url|target|from_ref|source_ref|fixed_in_pr)$/u,
  OUTSIDE_LIST = new Set(['followups.from_ref', 'outbox.target', 'run_prs.url', 'typed.source_ref']);

function setupTest() {
  const base = freshDb(),
    storePath = `${base.dir}/store.sqlite`;
  onTestFinished(base.cleanup);
  createStoreTables(storePath);
  return { hq: base.db, store: openStore(storePath) };
}

function openStore(path: string): Database {
  const store = new SqliteDatabase(path, { readonly: true });
  onTestFinished(() => store.close());
  return store;
}

function readColumns(db: Database, table: string): string[] {
  return db
    .query<{ name: string }, []>(`PRAGMA table_info("${table}")`)
    .all()
    .map((column) => column.name);
}

// Every unique key of the table made of plain columns: its primary key and its unique indexes.
function readUniqueKeys(db: Database, table: string): string[][] {
  const indexes = db
      .query<{ name: string; unique: number }, []>(`PRAGMA index_list("${table}")`)
      .all()
      .filter((index) => index.unique === 1)
      .map((index) =>
        db
          .query<{ name: string | null }, []>(`PRAGMA index_info("${index.name}")`)
          .all()
          .map((column) => column.name ?? ''),
      ),
    primary = db
      .query<{ name: string; pk: number }, []>(`PRAGMA table_info("${table}")`)
      .all()
      .filter((column) => column.pk > 0)
      .toSorted((left, right) => left.pk - right.pk)
      .map((column) => column.name);
  return [...new Map([primary, ...indexes].filter((key) => key.length > 0).map((key) => [key.join(','), key])).values()];
}

function readTables(db: Database): string[] {
  return db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((table) => table.name);
}

function readExpectedKeys(spec: RekeySpec): string[][] {
  return spec.key === null ? [] : [[spec.column, ...spec.key].toSorted()];
}

function readCandidates(db: Database): string[] {
  return readTables(db)
    .flatMap((table) => readColumns(db, table).map((column) => `${table}.${column}`))
    .filter((column) => CANDIDATE.test(column) || column === 'goal_days.key');
}

test.each(REKEY_SPECS.hq.map((spec) => [`${spec.table}.${spec.column}`, spec] as const))('hq.db has the re-keyed column %s and the columns of its key', (_name, spec: RekeySpec) => {
  const ctx = setupTest();
  expect(readColumns(ctx.hq, spec.table)).toEqual(expect.arrayContaining([spec.column, ...(spec.key ?? [])]));
});

test.each(REKEY_SPECS.noslop.map((spec) => [`${spec.table}.${spec.column}`, spec] as const))("noslop's store has the re-keyed column %s and the columns of its key", (_name, spec: RekeySpec) => {
  const ctx = setupTest();
  expect(readColumns(ctx.store, spec.table)).toEqual(expect.arrayContaining([spec.column, ...(spec.key ?? [])]));
});

test.each(REKEY_SPECS.hq.map((spec) => [`${spec.table}.${spec.column}`, spec] as const))('the unique key of hq.db column %s is the one the list says', (_name, spec: RekeySpec) => {
  const ctx = setupTest(),
    holding = readUniqueKeys(ctx.hq, spec.table).filter((key) => key.includes(spec.column));
  expect(holding.map((key) => key.toSorted())).toStrictEqual(readExpectedKeys(spec));
});

test("the unique keys of noslop's store columns are the ones the list says", () => {
  const ctx = setupTest();
  expect(readUniqueKeys(ctx.store, 'reviews')).toStrictEqual([['review_id']]);
  expect(readUniqueKeys(ctx.store, 'findings')).toStrictEqual([['review_id', 'finding_id']]);
  expect(readUniqueKeys(ctx.store, 'escapes')).toStrictEqual([['escape_id']]);

  // dispositions_key reads the pull request as COALESCE(pull_request, 0), which index_info reports
  // as an unnamed column, so the list names it in zeroIfNull.
  expect(readUniqueKeys(ctx.store, 'dispositions')).toStrictEqual([['repo', '', 'finding_id', 'source', 'at']]);
});

test('every hq.db column that could name a repo is in the list or outside it on purpose', () => {
  const ctx = setupTest(),
    listed = new Set(REKEY_SPECS.hq.map((spec) => `${spec.table}.${spec.column}`));
  expect(readCandidates(ctx.hq).filter((column) => !listed.has(column) && !OUTSIDE_LIST.has(column))).toStrictEqual([]);
});
