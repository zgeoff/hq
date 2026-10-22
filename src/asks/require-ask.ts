import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { getAsk } from './get-ask.ts';
import type { Ask, Kind } from './types.ts';

export function requireAsk(db: Database, id: string, kind?: Kind): Ask {
  const a = getAsk(db, id);
  if (!a || (kind && a.kind !== kind)) throw new HqError('not_found', `no ${kind ?? 'call or proposal'} with id ${id}`);
  return a;
}
