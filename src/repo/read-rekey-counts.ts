import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { buildRekeySql } from './build-rekey-sql.ts';
import type { RekeySpec, RepoNames } from './rekey-specs.ts';

export interface RekeyCount {
  column: string;

  // Rows holding the name being left, and rows already holding the name being taken.
  from: number;
  table: string;
  to: number;
}

const CountSchema = z.object({ total: z.number() });

function readCount(db: Database, spec: RekeySpec, where: string, params: string[]): number {
  const row =
    spec.metaKey === undefined
      ? db.query(`SELECT COUNT(*) AS total FROM "${spec.table}" WHERE ${where}`).get(...params)
      : db.query(`SELECT COUNT(*) AS total FROM "meta" AS row, json_each(row."value") AS entry WHERE row."key" = ? AND ${where}`).get(spec.metaKey, ...params);
  return CountSchema.parse(row).total;
}

// How many rows of each re-keyed column hold each name, and for a meta row how many keys of its
// object. A column the database lacks is a fault of this list, never skipped.
export function readRekeyCounts(db: Database, specs: RekeySpec[], names: RepoNames): RekeyCount[] {
  return specs.map((spec) => {
    const column = spec.metaKey === undefined ? `"${spec.column}"` : 'entry."key"';
    const sql = buildRekeySql(spec, column, names);
    return {
      table: spec.table,
      column: spec.column,
      from: readCount(db, spec, sql.fromWhere, sql.fromParams),
      to: readCount(db, spec, sql.toWhere, sql.toParams),
    };
  });
}
