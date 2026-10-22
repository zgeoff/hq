import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { isAnswerSource } from './is-answer-source.ts';
import { OVERRIDE_SCOPE } from './record-pr-override.ts';

export interface OwnerOverride {
  seq: number;
  at: string;
  head: string;
  source: string;
  note: string;
  scope?: string | undefined;
}

const OverrideRowsSchema = z.array(z.object({ seq: z.number(), at: z.string(), data: z.string() }));

// One override event that does not parse voids them all, so a gap never lets an older one stand.
export function findOwnerOverride(db: Database, repo: string, pr: number, head: string): OwnerOverride | null {
  const rows = OverrideRowsSchema.parse(db.query("SELECT seq, at, data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-override' ORDER BY seq").all(`pr:${repo}#${pr}`));
  const overrides = rows.map((row) => parseOverride(row));
  if (overrides.includes(null)) {
    return null;
  }
  return overrides.findLast((override) => override !== null && override.scope === OVERRIDE_SCOPE && override.head === head && isAnswerSource(override.source)) ?? null;
}

type OverrideRow = z.infer<typeof OverrideRowsSchema>[number];

const OverrideSchema = z.object({ head: z.string(), source: z.string(), note: z.string(), scope: z.string().optional() });

function parseOverride(row: OverrideRow): OwnerOverride | null {
  try {
    const parsed = OverrideSchema.safeParse(JSON.parse(row.data));
    return parsed.success ? { seq: row.seq, at: row.at, ...parsed.data } : null;
  } catch {
    return null;
  }
}
