import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { loadNoslopSettings } from '../noslop/load-noslop-settings.ts';
import { REKEY_SPECS } from './rekey-specs.ts';

const NamesSchema = z.array(z.object({ name: z.string() }));

// Every repo name hq.db knows, lowercased: the repo columns and refs that archive-history re-keys,
// and the noslop list.
export function readKnownRepos(db: Database): Set<string> {
  const stored = REKEY_SPECS.hq.flatMap((spec) => {
    if (spec.metaKey !== undefined || (spec.kind !== 'name' && spec.kind !== 'ref')) {
      return [];
    }
    const name = spec.kind === 'name' ? `"${spec.column}"` : `substr("${spec.column}", 1, instr("${spec.column}", '#') - 1)`;
    const rows = db.query(`SELECT DISTINCT LOWER(${name}) AS name FROM "${spec.table}" WHERE "${spec.column}" IS NOT NULL${spec.kind === 'ref' ? ` AND instr("${spec.column}", '#') > 0` : ''}`).all();
    return NamesSchema.parse(rows).map((row) => row.name);
  });
  return new Set([...stored, ...loadNoslopSettings(db).repos.map((name) => name.toLowerCase())]);
}
