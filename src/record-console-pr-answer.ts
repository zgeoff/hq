import type { Database } from 'bun:sqlite';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { findSubjectLink } from './find-subject-link.ts';
import { parsePRURL } from './parse-pr-url.ts';
import type { PRRef as PRURLRef } from './parse-pr-url.ts';
import { readPRHead } from './pr-status/read-pr-head.ts';
import { recordPRAnswer } from './pr-status/record-pr-answer.ts';
import { OWNER } from './releases/owner.ts';
import type { Runner } from './runner/types.ts';
import type { ConsoleReview } from './record-console-review.ts';
import type { UnblockItem } from './unblock/types.ts';

export interface ConsolePRAnswerInput {
  review: ConsoleReview;
  note: string;
  actor: string;
}

// A console lgtm, Changes or Reject on an item whose subject is a zgeoff PR also goes on that PR's
// record (keyed on the repo name alone), at the head GitHub gives now. The answer is already stored,
// so nothing here throws; the result says whether the record was written.
export async function recordConsolePRAnswer(db: Database, run: Runner, item: UnblockItem, input: ConsolePRAnswerInput): Promise<boolean> {
  if (input.review === 'later') {
    return false;
  }
  const ref = findOwnPRRef(item);
  if (ref === null) {
    return false;
  }
  try {
    const head = await readPRHead(run, `${ref.owner}/${ref.repo}`, ref.number),
      note = input.note.trim();
    await recordPRAnswer(db, { repo: ref.repo.toLowerCase(), pr: ref.number, answer: input.review, head, source: `console:${item.id}`, note: note === '' ? null : note, actor: input.actor });
    return true;
  } catch (error) {
    console.log(`${iso(now())} console: the ${input.review} on ${item.id} was not written to the PR record of ${ref.repo}#${ref.number}: ${(error as Error).message}`);
    return false;
  }
}

// The item's subject PR when it is zgeoff's, else null.
function findOwnPRRef(item: UnblockItem): PRURLRef | null {
  const ref = parsePRURL(findSubjectLink(item)?.url ?? '');
  return ref !== null && ref.owner.toLowerCase() === OWNER ? ref : null;
}
