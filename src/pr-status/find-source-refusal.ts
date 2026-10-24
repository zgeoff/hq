import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { ItemGrant, ItemOption } from '../parse-item-input.ts';
import { readRoundOptions } from '../asks/read-round-options.ts';
import type { PRRef } from './parse-pr-ref.ts';
import type { OwnerProbe } from './read-owner-session.ts';

// What the source must grant: an override of the open findings, or the risk of one finding.
type OwnerAction = { action: 'override' } | { action: 'accept-risk'; finding: string };

export interface SourceRequest {
  ref: PRRef;
  wanted: OwnerAction;
  source: string;

  // The PR's head as gh gives it now; null when gh could not read it.
  head: string | null;
}

// chat: has no record to check, so only the owner's own session may give it. A console: or call:
// source is the owner's answer to a call; a review answer in the console grants neither action.
export function findSourceRefusal(db: Database, request: SourceRequest, probe: OwnerProbe): string | null {
  const [kind = '', ...rest] = request.source.split(':');
  const id = rest.join(':');
  if (kind === 'call' || kind === 'console') {
    return findCallRefusal(db, { ...request, id, needsGrant: kind === 'console' });
  }
  return match(probe)
    .with({ verdict: 'owner' }, () => null)
    .with({ verdict: 'other' }, () => 'a chat: source is accepted only from the session of the owner (z-stu), as atc finds the caller; this caller is not it')
    .with({ verdict: 'unknown' }, (failed) => `a chat: source is accepted only from the session of the owner (z-stu), and atc could not say whether this caller is it: ${failed.cause}`)
    .exhaustive();
}

interface CallCheck extends SourceRequest {
  id: string;

  // A console: source counts only through a grant; a call: source on a call with no grants keeps
  // the plain-Yes rule, for accept-risk only.
  needsGrant: boolean;
}

const CallRowSchema = z.object({ title: z.string() });

const AnswerDataSchema = z.object({ answer: z.string(), title: z.string().optional() });

// --by and HQ_AS are the caller's own words, so only a console answer or an `hq call answer` that
// atc placed in z-stu's session (marked ownerSession) is the owner's.
function findCallRefusal(db: Database, check: CallCheck): string | null {
  const call = CallRowSchema.nullable().parse(db.query("SELECT title FROM asks WHERE id = ? AND kind = 'call'").get(check.id));
  if (call === null) {
    return `${check.source} is not a call in hq`;
  }
  const answer = findCurrentOwnerAnswer(db, check.id);
  if (answer === null) {
    return `${check.source} has no owner answer for its current round, in the console or by \`hq call answer\` from the owner's session (z-stu), as atc finds the caller`;
  }
  const reused = check.wanted.action === 'override' ? findOverrideAtOtherHead(db, check, answer.seq) : null;
  if (reused !== null) {
    return `${check.source} already backs an override of ${check.ref.slug}#${check.ref.pr} at ${reused.slice(0, 7)}, and the owner answered it for that head only`;
  }
  const data = AnswerDataSchema.parse(JSON.parse(answer.data));
  const options = readRoundOptions(db, check.id, answer.seq);
  if (check.needsGrant || options.some((option) => option.grants !== undefined)) {
    return findGrantRefusal(check, options, data.answer);
  }

  // A plain yes names no head, so its first use could pass a head the owner never saw.
  if (check.wanted.action === 'override') {
    return `${check.source} has no option that grants the override: an override needs the owner to pick an option whose grants name the PR and the head, and a plain yes names no head`;
  }
  const title = data.title ?? call.title;
  if (!hasPRName(title, check.ref)) {
    return `${check.source} does not name ${check.ref.slug}#${check.ref.pr} in the title the owner answered`;
  }
  if (!hasActionName(title, check.wanted)) {
    return `${check.source} does not name ${formatAction(check.wanted)} in the title the owner answered`;
  }
  if (!isYes(data.answer)) {
    return `the owner's answer to ${check.source} is not a yes: "${data.answer}"`;
  }
  return null;
}

const OverrideHeadsSchema = z.array(z.object({ head: z.string() }));

// Only overrides since the owner's current answer: a new answer is a new approval. call:<id> and
// console:<id> name the same answer, so an override under either form counts.
function findOverrideAtOtherHead(db: Database, check: CallCheck, answerSeq: number): string | null {
  const rows = OverrideHeadsSchema.parse(
    db
      .query("SELECT json_extract(data, '$.head') AS head FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-override' AND json_extract(data, '$.source') IN (?, ?) AND seq > ? ORDER BY seq")
      .all(`pr:${check.ref.repo}#${check.ref.pr}`, `call:${check.id}`, `console:${check.id}`, answerSeq),
  );
  return rows.find((row) => row.head !== check.head)?.head ?? null;
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

// The option the console stores before ` | ` (or the whole answer) is the one the owner picked.
function findGrantRefusal(check: CallCheck, options: ItemOption[], answer: string): string | null {
  const picked = (answer.split(' | ')[0] ?? '').trim();
  const option = options.find((candidate) => candidate.label === picked);
  if (option?.grants === undefined) {
    return `the option the owner picked in ${check.source} ("${picked}") grants no ${check.wanted.action}`;
  }
  if (check.wanted.action === 'override' && option.grants.head === undefined) {
    return `the option the owner picked in ${check.source} grants an override with no head: an override grant names the head the owner approved`;
  }
  if (!isMatchingGrant(option.grants, check)) {
    return `the option the owner picked in ${check.source} grants ${formatGrant(option.grants)}, not ${formatWanted(check, option.grants)}`;
  }
  return null;
}

function isMatchingGrant(grant: ItemGrant, check: CallCheck): boolean {
  const finding = check.wanted.action === 'accept-risk' ? check.wanted.finding : undefined;
  const atHead = grant.head === undefined || grant.head === check.head;
  return grant.action === check.wanted.action && grant.pr.toLowerCase() === `${check.ref.slug}#${check.ref.pr}`.toLowerCase() && grant.finding === finding && atHead;
}

function formatGrant(grant: ItemGrant): string {
  const finding = grant.finding === undefined ? '' : ` finding ${grant.finding}`;
  const head = grant.head === undefined ? '' : ` at ${grant.head.slice(0, 7)}`;
  return `${grant.action} of ${grant.pr}${finding}${head}`;
}

function formatWanted(check: CallCheck, grant: ItemGrant): string {
  const finding = check.wanted.action === 'accept-risk' ? ` finding ${check.wanted.finding}` : '';
  const head = grant.head === undefined ? '' : ` at ${check.head === null ? 'a head gh could not read' : check.head.slice(0, 7)}`;
  return `${check.wanted.action} of ${check.ref.slug}#${check.ref.pr}${finding}${head}`;
}

function hasPRName(title: string, ref: PRRef): boolean {
  const owner = ref.slug.split('/')[0] ?? '';
  const pattern = new RegExp(`(?<![\\w./-])(?:${RegExp.escape(owner)}/)?${RegExp.escape(ref.repo)}#${ref.pr}(?!\\d)`, 'iu');
  return pattern.test(title);
}

function hasActionName(title: string, wanted: OwnerAction): boolean {
  return match(wanted)
    .with({ action: 'override' }, () => /(?<![\w-])override(?![\w-])/iu.test(title))
    .with({ action: 'accept-risk' }, (risk) => /(?<![\w-])accept-risk(?![\w-])/iu.test(title) && new RegExp(`(?<![\\w-])${RegExp.escape(risk.finding)}(?![\\w-])`, 'iu').test(title))
    .exhaustive();
}

function formatAction(wanted: OwnerAction): string {
  return wanted.action === 'override' ? 'an override' : `accept-risk of finding ${wanted.finding}`;
}

// The option the console stores before ` | ` (or the whole answer) is the owner's decision. Only a
// plain Yes grants: words such as "Yes, but not yet" are the owner's to weigh, never hq's.
function isYes(answer: string): boolean {
  const option = answer.split(' | ')[0] ?? '';
  return /^yes[.!]?$/iu.test(option.trim());
}
