import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { PRRef } from './parse-pr-ref.ts';
import type { OwnerProbe } from './read-owner-session.ts';

const CONSOLE_ANSWERS = "'console-answer', 'console-review'";

// chat: has no record to check, so only the owner's own session may give it.
export function findSourceRefusal(db: Database, ref: PRRef, source: string, probe: OwnerProbe): string | null {
  const [kind = '', ...rest] = source.split(':');
  const id = rest.join(':');
  if (kind === 'call') {
    return findCallRefusal(db, ref, source, id);
  }
  if (kind === 'console') {
    const row = db.query(`SELECT 1 FROM events WHERE subject_id = ? AND action IN (${CONSOLE_ANSWERS}) LIMIT 1`).get(id);
    return row === null ? `${source} is not an answer the console wrote` : null;
  }
  return match(probe)
    .with({ verdict: 'owner' }, () => null)
    .with({ verdict: 'other' }, () => 'a chat: source is accepted only from the session of the owner (z-stu), found through ATC_SESSION_ID; this caller is not it')
    .with({ verdict: 'unknown' }, (failed) => `a chat: source is accepted only from the session of the owner (z-stu), and atc could not say whether this caller is it: ${failed.cause}`)
    .exhaustive();
}

const CallRowSchema = z.object({ title: z.string() });

const AnswerDataSchema = z.object({ title: z.string().optional() });

// --by and HQ_AS are the caller's own words, so only a console answer or an `hq call answer` that
// atc placed in z-stu's session (marked ownerSession) is the owner's.
function findCallRefusal(db: Database, ref: PRRef, source: string, id: string): string | null {
  const call = CallRowSchema.nullable().parse(db.query("SELECT title FROM asks WHERE id = ? AND kind = 'call'").get(id));
  if (call === null) {
    return `${source} is not a call in hq`;
  }
  const answer = findCurrentOwnerAnswer(db, id);
  if (answer === null) {
    return `${source} has no owner answer for its current round, in the console or by \`hq call answer\` from the owner's session (z-stu), found through ATC_SESSION_ID`;
  }
  const title = AnswerDataSchema.parse(JSON.parse(answer.data)).title ?? call.title;
  if (!hasPRName(title, ref)) {
    return `${source} does not name ${ref.slug}#${ref.pr} in the title the owner answered`;
  }
  return null;
}

const OwnerAnswerSchema = z.object({ seq: z.number(), data: z.string() });

function findCurrentOwnerAnswer(db: Database, id: string): z.infer<typeof OwnerAnswerSchema> | null {
  const answer = OwnerAnswerSchema.nullable().parse(
    db
      .query("SELECT seq, data FROM events WHERE subject = 'ask' AND subject_id = ? AND (action = 'console-answer' OR (action = 'answered' AND json_extract(data, '$.ownerSession') = 1)) ORDER BY seq DESC LIMIT 1")
      .get(id),
  );
  if (answer === null) {
    return null;
  }
  const refiled = db.query("SELECT 1 FROM events WHERE subject = 'ask' AND subject_id = ? AND action IN ('reasked', 'requeued') AND seq > ? LIMIT 1").get(id, answer.seq);
  return refiled === null ? answer : null;
}

function hasPRName(title: string, ref: PRRef): boolean {
  const owner = ref.slug.split('/')[0] ?? '';
  const pattern = new RegExp(`(?<![\\w./-])(?:${RegExp.escape(owner)}/)?${RegExp.escape(ref.repo)}#${ref.pr}(?!\\d)`, 'iu');
  return pattern.test(title);
}

