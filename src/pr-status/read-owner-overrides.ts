import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { isAnswerSource } from './is-answer-source.ts';
import { OVERRIDE_SCOPE } from './override-scope.ts';

export interface OwnerOverride {
  seq: number;
  at: string;
  head: string;
  source: string;
  note: string;
  scope?: string | undefined;
}

const OverrideRowsSchema = z.array(z.object({ seq: z.number(), at: z.string(), data: z.string() }));

// The PR's overrides of open findings from an owner's answer, oldest first. One override event that
// does not parse voids them all, so a gap never lets an older one stand.
export function readOwnerOverrides(db: Database, repo: string, pr: number): OwnerOverride[] {
  const rows = OverrideRowsSchema.parse(db.query("SELECT seq, at, data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-override' ORDER BY seq").all(`pr:${repo}#${pr}`));
  const overrides = rows.map((row) => parseOverride(row));
  if (overrides.includes(null)) {
    return [];
  }
  return overrides.filter((override): override is OwnerOverride => override !== null && override.scope === OVERRIDE_SCOPE && isAnswerSource(override.source));
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
