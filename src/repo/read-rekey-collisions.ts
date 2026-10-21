import type { Database } from 'bun:sqlite';
import { buildRekeySql } from './build-rekey-sql.ts';
import type { RekeySpec, RepoNames } from './rekey-specs.ts';

type KeyRow = Record<string, string | number | null>;

function formatKey(spec: RekeySpec, row: KeyRow): string {
  const others = (spec.key ?? []).map((name) => `${name}=${row[name]}`);
  return `${spec.table}.${spec.column}=${row['value']}${others.length > 0 ? ` (${others.join(', ')})` : ''}`;
}

function readKeyColumn(spec: RekeySpec, alias: string, name: string): string {
  return spec.zeroIfNull?.includes(name) ? `COALESCE(${alias}."${name}", 0)` : `${alias}."${name}"`;
}

// A row that holds the new name already, with the same key as a row about to take it. The join
// pairs each row to re-key with the row it would become; a pair means the unique key would repeat.
function readSpecCollisions(db: Database, spec: RekeySpec, names: RepoNames): string[] {
  if (spec.key === null) {
    return [];
  }
  const columns = [`n."${spec.column}" AS value`, ...spec.key.map((name) => `n."${name}" AS "${name}"`)].join(', '),
    keyJoin = spec.key.map((name) => ` AND ${readKeyColumn(spec, 'n', name)} = ${readKeyColumn(spec, 'm', name)}`).join(''),
    rekey = buildRekeySql(spec, `m."${spec.column}"`, names),
    select = `SELECT ${columns} FROM "${spec.table}" AS m JOIN "${spec.table}" AS n ON n."${spec.column}" = ${rekey.newValue}${keyJoin} WHERE ${rekey.fromWhere}`;
  return db
    .query<KeyRow, string[]>(select)
    .all(...rekey.newParams, ...rekey.fromParams)
    .map((row) => formatKey(spec, row));
}

// The keys that would repeat after the re-key, for the specs whose unique key holds the column.
export function readRekeyCollisions(db: Database, specs: RekeySpec[], names: RepoNames): string[] {
  return specs.flatMap((spec) => readSpecCollisions(db, spec, names));
}
