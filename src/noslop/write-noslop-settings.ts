import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import type { NoslopSettings } from './load-noslop-settings.ts';

const NOSLOP_KEY = 'noslop';

export function writeNoslopSettings(db: Database, settings: NoslopSettings): void {
  setMeta(db, NOSLOP_KEY, JSON.stringify({ repos: [...settings.repos].toSorted(), sha: settings.sha }));
}
