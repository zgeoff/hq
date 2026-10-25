import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { CI_CHECK_SCOPE } from './ci-check-scope.ts';
import { isAnswerSource } from './is-answer-source.ts';

export interface CIOverride {
  seq: number;
  at: string;
  head: string;
  source: string;
  note: string;
  check: string;
}

const RowsSchema = z.array(z.object({ seq: z.number(), at: z.string(), data: z.string() }));

export function readCIOverrides(db: Database, repo: string, pr: number): CIOverride[] {
  const rows = RowsSchema.parse(db.query("SELECT seq, at, data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-override' ORDER BY seq").all(`pr:${repo}#${pr}`));
  const overrides: CIOverride[] = [];
  for (const row of rows) {
    const data = parseData(row.data);
    if (data === null) {
      return [];
    }
    if (data.scope !== CI_CHECK_SCOPE) {
      continue;
    }
    if (data.check === undefined || data.check === '') {
      return [];
    }
    if (isAnswerSource(data.source)) {
      overrides.push({ seq: row.seq, at: row.at, head: data.head, source: data.source, note: data.note, check: data.check });
    }
  }
  return overrides;
}

const DataSchema = z.object({ head: z.string(), source: z.string(), note: z.string(), scope: z.string().optional(), check: z.string().optional() });

function parseData(text: string): z.infer<typeof DataSchema> | null {
  try {
    const parsed = DataSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
