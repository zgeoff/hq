import type { Database } from 'bun:sqlite';
import { z } from 'zod';

export interface OwnerAnswer {
  seq: number;
  at: string;
  head: string | null;
  answer: 'lgtm' | 'changes' | 'reject';
  source: string;
  note: string | null;
}

const AnswerRowSchema = z.object({ seq: z.number(), at: z.string(), data: z.string() });

// The PR's pr-answer events, oldest first; null when any event does not parse, so a gap never lets
// an older answer stand.
export function readPRAnswers(db: Database, repo: string, pr: number): OwnerAnswer[] | null {
  const rows = z.array(AnswerRowSchema).parse(db.query("SELECT seq, at, data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-answer' ORDER BY seq").all(`pr:${repo}#${pr}`));
  const answers = rows.map((row) => parseAnswer(row));
  return answers.includes(null) ? null : answers.filter((answer) => answer !== null);
}

const AnswerSchema = z.object({ answer: z.enum(['lgtm', 'changes', 'reject']), head: z.string().nullable(), source: z.string(), note: z.string().nullish() });

type AnswerRow = z.output<typeof AnswerRowSchema>;

function parseAnswer(row: AnswerRow): OwnerAnswer | null {
  try {
    const parsed = AnswerSchema.safeParse(JSON.parse(row.data));
    return parsed.success ? { seq: row.seq, at: row.at, head: parsed.data.head, answer: parsed.data.answer, source: parsed.data.source, note: parsed.data.note ?? null } : null;
  } catch {
    return null;
  }
}
