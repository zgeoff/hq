import { parseStoredExtras } from '../parse-stored-extras.ts';
import type { Ask, Row } from './types.ts';

export function parseAskRow(r: Row | null): Ask | null {
  return r ? { ...r, issues: JSON.parse(r.issues) as string[], item: parseStoredExtras(r.item) } : null;
}
