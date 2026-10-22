import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { isAnswerSource } from './is-answer-source.ts';

const AnswerSchema = z.object({ answer: z.enum(['lgtm', 'changes', 'reject']), head: z.string().nullable(), source: z.string() });

interface OwnerAnswer {
  seq: number;
  at: string;
  head: string | null;
  answer: 'lgtm' | 'changes' | 'reject';
  source: string;
}

export interface OwnerLgtm {
  changes: OwnerAnswer;
  lgtm: OwnerAnswer;
}

// The reviewed head the commits since start from, and the PR's head now.
export interface AnswerEnds {
  reviewed: string;
  head: string;
}

interface AnswerRow {
  seq: number;
  at: string;
  data: string;
}

// The owner's `changes` at the reviewed head and `lgtm` at the head now, from the pr-answer events.
export function findOwnerLgtm(db: Database, repo: string, pr: number, ends: AnswerEnds): OwnerLgtm | null {
  const answers = readAnswers(db, repo, pr),
    changes = answers?.findLast((a) => a.head === ends.reviewed) ?? null,
    lgtm = answers?.at(-1) ?? null;
  if (changes === null || lgtm === null || ends.reviewed === ends.head) {
    return null;
  }
  return isOwnerPair(changes, lgtm, ends.head) ? { changes, lgtm } : null;
}

function isOwnerPair(changes: OwnerAnswer, lgtm: OwnerAnswer, head: string): boolean {
  return changes.answer === 'changes' && lgtm.answer === 'lgtm' && lgtm.head === head && isAnswerSource(changes.source) && isAnswerSource(lgtm.source);
}

// Oldest first; null when any event does not parse, so a gap never lets an older answer stand.
function readAnswers(db: Database, repo: string, pr: number): OwnerAnswer[] | null {
  const answers = (db.query("SELECT seq, at, data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-answer' ORDER BY seq").all(`pr:${repo}#${pr}`) as AnswerRow[]).map((row) => parseAnswer(row));
  return answers.includes(null) ? null : answers.filter((a) => a !== null);
}

function parseAnswer(row: AnswerRow): OwnerAnswer | null {
  try {
    const parsed = AnswerSchema.safeParse(JSON.parse(row.data));
    return parsed.success ? { seq: row.seq, at: row.at, head: parsed.data.head, answer: parsed.data.answer, source: parsed.data.source } : null;
  } catch {
    return null;
  }
}
