import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { isAnswerSource } from './is-answer-source.ts';

const RowsSchema = z.array(z.object({ data: z.string() }));

// Only hq's own records count: a reply's author proves nothing, because every session posts as the
// owner's login.
export function findAcceptedRisks(db: Database, repo: string, pr: number): Set<string> {
  const rows = RowsSchema.parse(db.query("SELECT data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-accepted-risk' ORDER BY seq").all(`pr:${repo}#${pr}`));
  const accepted = new Set<string>();
  for (const row of rows) {
    const risk = parseRisk(row.data);
    if (risk !== null && isAnswerSource(risk.source)) {
      accepted.add(risk.finding);
    }
  }
  return accepted;
}

const RiskSchema = z.object({ finding: z.string(), source: z.string() });

function parseRisk(data: string): z.output<typeof RiskSchema> | null {
  try {
    const parsed = RiskSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
