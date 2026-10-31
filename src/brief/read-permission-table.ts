import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HqError } from '../errors.ts';
import { parsePermissionTable } from './parse-permission-table.ts';
import type { PermissionRow } from './types.ts';

const WHERE = ['skills/delivery-lead/references/briefs.private.md', 'skills/agent-delegation/references/briefs.private.md'];

// The permission phrases of the private brief wording in the hq-private checkout. Nothing else in
// that file is read out of this function, and an error names the file, never its text.
export function readPermissionTable(privateDir: string): PermissionRow[] {
  const found = WHERE.map((path) => join(privateDir, path)).find((path) => existsSync(path));
  if (found === undefined) {
    throw new HqError('not_found', `no briefs.private.md under ${privateDir}; hq defs shows the hq-private clone`);
  }
  const rows = parsePermissionTable(readFileSync(found, 'utf8'));
  if (rows.length === 0) {
    throw new HqError('bad_state', `${found} has no permission phrasing table`);
  }
  return rows;
}
