import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { OPEN } from './open.ts';

interface Open {
  since: string;
  line: string;
}

export function openProblems(db: Database): Record<string, Open> {
  return metaJson(db, 'health_open', OPEN, {});
}
