import type { Database } from 'bun:sqlite';
import { buildRekeySql } from './build-rekey-sql.ts';
import type { RekeySpec, RepoNames } from './rekey-specs.ts';

export interface RekeyCount {
  column: string;

  // Rows holding the name being left, and rows already holding the name being taken.
  from: number;
  table: string;
  to: number;
}

function readCount(db: Database, spec: RekeySpec, where: string, params: string[]): number {
  const row = db.query<{ n: number }, string[]>(`SELECT COUNT(*) AS n FROM "${spec.table}" WHERE ${where}`).get(...params);
  return row?.n ?? 0;
}

// How many rows of each re-keyed column hold each name. A column the database lacks is a fault of
// this list, never skipped.
export function readRekeyCounts(db: Database, specs: RekeySpec[], names: RepoNames): RekeyCount[] {
  return specs.map((spec) => {
    const sql = buildRekeySql(spec, `"${spec.column}"`, names);
    return {
      table: spec.table,
      column: spec.column,
      from: readCount(db, spec, sql.fromWhere, sql.fromParams),
      to: readCount(db, spec, sql.toWhere, sql.toParams),
    };
  });
}
