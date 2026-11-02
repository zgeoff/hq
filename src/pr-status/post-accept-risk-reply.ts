import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';
import { buildAcceptRiskReply } from './build-accept-risk-reply.ts';
import type { AcceptRiskReplyInput } from './build-accept-risk-reply.ts';
import type { PRRef } from './parse-pr-ref.ts';
import { readPRComments } from './read-pr-comments.ts';
import type { PRComment } from './read-pr-comments.ts';
import { pickIssueTarget, pickThreadTarget } from './pick-reply-target.ts';

export interface PostedReply {
  reply: 'posted' | 'already-posted';
  url: string;
  text: string;
}

// A reply that could not be posted. Carries the exact text and where it goes, so the caller can
// print both for someone to post by hand.
export class ReplyFailureError extends HqError {
  readonly text: string;
  readonly where: string;

  constructor(why: string, text: string, where: string) {
    super('reply_failed', why);
    this.name = 'ReplyFailureError';
    this.text = text;
    this.where = where;
  }
}

// Posts the owner's accepted-risk reply as the login gh runs under, where pickThreadTarget or
// pickIssueTarget puts it: in the finding's thread on the diff, else as an issue comment. A reply
// that already stands is not posted again.
export async function postAcceptRiskReply(run: Runner, ref: PRRef, input: AcceptRiskReplyInput): Promise<PostedReply> {
  const text = buildAcceptRiskReply(input, 'thread');
  const issueText = buildAcceptRiskReply(input, 'issue');
  const eitherText = `On the finding's thread:\n\n${text}\n\nOr, for a finding outside the diff, as an issue comment:\n\n${issueText}`;
  const generalWhere = `the finding's thread or the issue comments of ${ref.slug}#${ref.pr}`;
  const reviewPath = `repos/${ref.slug}/pulls/${ref.pr}/comments`;
  const issuePath = `repos/${ref.slug}/issues/${ref.pr}/comments`;
  const review = await readOrFail(run, reviewPath, eitherText, generalWhere);
  const onThread = pickThreadTarget(review, input.finding);
  const issue = onThread === null ? await readOrFail(run, issuePath, issueText, generalWhere) : [];
  const target = onThread ?? pickIssueTarget(issue, input.finding);
  const shown = onThread === null ? issueText : text;
  return await match(target)
    .with({ kind: 'standing' }, (standing): Promise<PostedReply> => Promise.resolve({ reply: 'already-posted', url: standing.url, text: shown }))
    .with({ kind: 'thread' }, (thread) => post(run, `${reviewPath}/${thread.opener.id}/replies`, text, `the thread of the finding's comment ${thread.opener.url}`))
    .with({ kind: 'issue' }, () => post(run, issuePath, issueText, `the issue comments of ${ref.slug}#${ref.pr}`))
    .with({ kind: 'missing' }, () => {
      throw new HqError('not_found', `no noslop comment holds finding ${input.finding} on ${ref.slug}#${ref.pr}, in a thread on the diff or among the PR's issue comments, so there is nowhere to post the reply; the record stands, and a rerun posts it once the finding's comment exists`);
    })
    .exhaustive();
}

async function readOrFail(run: Runner, path: string, text: string, where: string): Promise<PRComment[]> {
  try {
    return await readPRComments(run, path);
  } catch (error) {
    throw new ReplyFailureError(`the reply was not posted: ${error instanceof Error ? error.message : String(error)}`, text, where);
  }
}

async function post(run: Runner, path: string, text: string, where: string): Promise<PostedReply> {
  try {
    const result = await boundedRunner(run, CALL_MS)(['gh', 'api', '-X', 'POST', path, '-f', `body=${text}`, '--jq', '.html_url']);
    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout).trim().slice(0, 300));
    }
    return { reply: 'posted', url: result.stdout.trim(), text };
  } catch (error) {
    throw new ReplyFailureError(`the reply was not posted: gh api POST ${path} failed (${error instanceof Error ? error.message : String(error)})`, text, where);
  }
}
