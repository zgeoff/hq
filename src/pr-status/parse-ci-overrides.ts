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

export interface OverrideEventRow {
  seq: number;
  at: string;
  data: string;
}

// One override row hq cannot read voids every CI override of the PR, so a gap never lets an older
// one stand.
export function parseCIOverrides(rows: readonly OverrideEventRow[]): CIOverride[] {
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
