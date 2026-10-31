import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { NoslopSettings } from '../noslop/load-noslop-settings.ts';
import { loadNoslopSettings } from '../noslop/load-noslop-settings.ts';

// The noslop settings of the hq db at `path`, opened read-only: a db that is not there is not
// created, an older one is not migrated, and the settings are empty.
export function readNoslopSettings(path: string): NoslopSettings {
  if (!existsSync(path)) {
    return { repos: [], sha: null, caps: {} };
  }
  const db = new Database(path, { readonly: true, strict: true });
  try {
    return loadNoslopSettings(db);
  } finally {
    db.close();
  }
}
