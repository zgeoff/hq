import { Database } from 'bun:sqlite';
import type { NoslopSettings } from '../noslop/load-noslop-settings.ts';
import { loadNoslopSettings } from '../noslop/load-noslop-settings.ts';
import type { BriefFiles } from './types.ts';

export function readNoslopSettings(files: BriefFiles, path: string): NoslopSettings {
  if (files.readKind(path) === 'missing') {
    return { repos: [], sha: null, caps: {} };
  }
  const db = new Database(path, { readonly: true, strict: true });
  try {
    return loadNoslopSettings(db);
  } finally {
    db.close();
  }
}
