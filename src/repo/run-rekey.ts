import type { Database } from 'bun:sqlite';
import { buildRekeySql } from './build-rekey-sql.ts';
import type { RekeySpec, RepoNames } from './rekey-specs.ts';

function runSpecRekey(db: Database, spec: RekeySpec, names: RepoNames): void {
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
