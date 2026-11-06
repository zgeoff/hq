import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { ItemGrant, ItemOption } from '../parse-item-input.ts';
import { readRoundOptions } from '../asks/read-round-options.ts';
import type { PRRef } from './parse-pr-ref.ts';
import type { OwnerProbe } from './read-owner-session.ts';
import { findChatRefusal } from './find-chat-refusal.ts';
import { findCurrentOwnerAnswer } from './find-current-owner-answer.ts';
import { hasPRName } from './has-pr-name.ts';
import { isPlainYes } from './is-plain-yes.ts';

type OwnerAction = { action: 'override'; check?: string } | { action: 'accept-risk'; finding: string };

export interface SourceRequest {
  ref: PRRef;
  wanted: OwnerAction;
  source: string;
}

// chat: has no record to check, so only the owner's own session may give it.
export function findSourceRefusal(db: Database, request: SourceRequest, probe: OwnerProbe): string | null {
  const [kind = '', ...rest] = request.source.split(':');
  const id = rest.join(':');
  if ((kind === 'call' || kind === 'console') && request.wanted.action === 'override' && request.wanted.check !== undefined) {
    return `${request.source} cannot override a CI check: only the owner's own chat source may, so the owner names the check in the command`;
  }
  if (kind === 'call' || kind === 'console') {
    return findCallRefusal(db, { ...request, id, needsGrant: kind === 'console' });
  }
  return findChatRefusal(probe);
}

interface CallCheck extends SourceRequest {
  id: string;

  needsGrant: boolean;
}

const CallRowSchema = z.object({ title: z.string() });

const AnswerDataSchema = z.object({ answer: z.string(), title: z.string().optional() });

// --by and HQ_AS are the caller's own words, so only a console answer or an `hq call answer` that
// atc placed in z-stu's session is the owner's.
function findCallRefusal(db: Database, check: CallCheck): string | null {
  const call = CallRowSchema.nullable().parse(db.query("SELECT title FROM asks WHERE id = ? AND kind = 'call'").get(check.id));
  if (call === null) {
    return `${check.source} is not a call in hq`;
  }
  const answer = findCurrentOwnerAnswer(db, check.id);
  if (answer === null) {
    return `${check.source} has no owner answer for its current round, in the console or by \`hq call answer\` from the owner's session (z-stu), as atc finds the caller`;
  }
  const data = AnswerDataSchema.parse(JSON.parse(answer.data));
  const options = readRoundOptions(db, check.id, answer.seq);
  if (check.needsGrant || options.some((option) => option.grants !== undefined)) {
    return findGrantRefusal(check, options, data.answer);
  }

  // A call title can name an override of one CI check, so a plain yes cannot show the owner meant the findings.
  if (check.wanted.action === 'override') {
    return `${check.source} has no option that grants the override: an override needs the owner to pick an option whose grants name the PR`;
  }
  const title = data.title ?? call.title;
  if (!hasPRName(title, check.ref)) {
    return `${check.source} does not name ${check.ref.slug}#${check.ref.pr} in the title the owner answered`;
  }
  if (!hasActionName(title, check.wanted)) {
    return `${check.source} does not name ${formatAction(check.wanted)} in the title the owner answered`;
  }
  if (!isPlainYes(data.answer)) {
    return `the owner's answer to ${check.source} is not a yes: "${data.answer}"`;
  }
  return null;
}

// The option the console stores before ` | ` (or the whole answer) is the one the owner picked.
function findGrantRefusal(check: CallCheck, options: ItemOption[], answer: string): string | null {
  const picked = (answer.split(' | ')[0] ?? '').trim();
  const option = options.find((candidate) => candidate.label === picked);
  if (option?.grants === undefined) {
    return `the option the owner picked in ${check.source} ("${picked}") grants no ${check.wanted.action}`;
  }
  if (!isMatchingGrant(option.grants, check)) {
    return `the option the owner picked in ${check.source} grants ${formatGrant(option.grants)}, not ${formatWanted(check)}`;
  }
  return null;
}

function isMatchingGrant(grant: ItemGrant, check: CallCheck): boolean {
  const finding = check.wanted.action === 'accept-risk' ? check.wanted.finding : undefined;
  return grant.action === check.wanted.action && grant.pr.toLowerCase() === `${check.ref.slug}#${check.ref.pr}`.toLowerCase() && grant.finding === finding;
}

function formatGrant(grant: ItemGrant): string {
  const finding = grant.finding === undefined ? '' : ` finding ${grant.finding}`;
  return `${grant.action} of ${grant.pr}${finding}`;
}

function formatWanted(check: CallCheck): string {
  const finding = check.wanted.action === 'accept-risk' ? ` finding ${check.wanted.finding}` : '';
  return `${check.wanted.action} of ${check.ref.slug}#${check.ref.pr}${finding}`;
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
