import type { Database } from 'bun:sqlite';
import { buildRekeySql } from './build-rekey-sql.ts';
import type { RekeySpec, RepoNames } from './rekey-specs.ts';

function runSpecRekey(db: Database, spec: RekeySpec, names: RepoNames): void {
  if (spec.metaKey !== undefined) {
    runMetaRekey(db, spec.metaKey, spec, names);
    return;
  }
  const sql = buildRekeySql(spec, `"${spec.column}"`, names);
  db.query<unknown, string[]>(`UPDATE "${spec.table}" SET "${spec.column}" = ${sql.newValue} WHERE ${sql.fromWhere}`).run(...sql.newParams, ...sql.fromParams);
}

// Every column of the database in one transaction: all of them change, or none does.
export function runRekey(db: Database, specs: RekeySpec[], names: RepoNames): void {
  db.transaction(() => {
    for (const spec of specs) {
      runSpecRekey(db, spec, names);
    }
  })();
}

// The object is rebuilt in its own key order, so a re-key and its way back give the same text.
function runMetaRekey(db: Database, metaKey: string, spec: RekeySpec, names: RepoNames): void {
  const sql = buildRekeySql(spec, 'entry."key"', names);
  db.query(`UPDATE "meta" SET "value" = (SELECT json_group_object(CASE WHEN ${sql.fromWhere} THEN ${sql.newValue} ELSE entry."key" END, json(entry."value")) FROM json_each("meta"."value") AS entry) WHERE "key" = ?`).run(...sql.fromParams, ...sql.newParams, metaKey);
}
