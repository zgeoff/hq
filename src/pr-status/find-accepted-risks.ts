import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { isAnswerSource } from './is-answer-source.ts';

const RowsSchema = z.array(z.object({ seq: z.number(), data: z.string() }));

// One hq record of the owner's accepted risk: the `pr-accepted-risk` event's seq is its id.
export interface AcceptedRiskRecord {
  event: number;
  finding: string;
  source: string;
  note: string;
}

// The PR's valid records, one per finding: the first stands, and a later one for the same finding
// repeats it.
export function readAcceptedRiskRecords(db: Database, repo: string, pr: number): AcceptedRiskRecord[] {
  const rows = RowsSchema.parse(db.query("SELECT seq, data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-accepted-risk' ORDER BY seq").all(`pr:${repo}#${pr}`));
  const records = new Map<string, AcceptedRiskRecord>();
  for (const row of rows) {
    const risk = parseRisk(row.data);
    if (risk !== null && isAnswerSource(risk.source) && !records.has(risk.finding)) {
      records.set(risk.finding, {
        event: row.seq,
        finding: risk.finding,
        source: risk.source,
        note: risk.note ?? '',
      });
    }
  }
  return [...records.values()];
}

// Only hq's own records count: a reply's author proves nothing, because every session posts as the
// owner's login.
export function findAcceptedRisks(db: Database, repo: string, pr: number): Set<string> {
  return new Set(readAcceptedRiskRecords(db, repo, pr).map((record) => record.finding));
}

const RiskSchema = z.object({
  finding: z.string(),
  source: z.string(),
  note: z.string().optional(),
});

function parseRisk(data: string): z.output<typeof RiskSchema> | null {
  try {
    const parsed = RiskSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
