import type { Database } from 'bun:sqlite';
import type { z } from 'zod';
import { HqError } from '../errors.ts';
import { getMeta } from './get-meta.ts';

// A meta value that holds JSON, checked against its schema. A missing key gives the fallback; a
// value that is not JSON, or does not fit the schema, is bad_meta naming the key.
export function metaJson<S extends z.ZodType>(db: Database, key: string, schema: S, fallback: z.output<S>): z.output<S> {
  const raw = getMeta(db, key);
  if (raw === null) return fallback;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new HqError('bad_meta', `meta '${key}' is not valid JSON`, { key });
  }
  const r = schema.safeParse(value);
  if (!r.success) {
    const i = r.error.issues[0]!;
    throw new HqError('bad_meta', `meta '${key}' is malformed at ${i.path.join('.') || 'the top'}: ${i.message}`, { key });
  }
  return r.data;
}
