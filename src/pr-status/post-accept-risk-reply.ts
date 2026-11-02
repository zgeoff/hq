import { HqError } from "../errors.ts";
import { boundedRunner } from "../runner/bounded-runner.ts";
import type { Runner } from "../runner/types.ts";
import { OWNER } from "../releases/owner.ts";
import { CALL_MS } from "../watcher/call-ms.ts";
import { buildAcceptRiskReply } from "./build-accept-risk-reply.ts";
import type { AcceptRiskReplyInput } from "./build-accept-risk-reply.ts";
import type { PRRef } from "./parse-pr-ref.ts";
import { readPRComments } from "./read-pr-comments.ts";
import type { PRComment } from "./read-pr-comments.ts";

export interface PostedReply {
  reply: "posted" | "already-posted";
  url: string;
  text: string;
}

// A reply that could not be posted. Carries the exact text and where it goes, so the caller can
// print both for someone to post by hand.
export class ReplyFailureError extends HqError {
  readonly text: string;
  readonly where: string;

  constructor(why: string, text: string, where: string) {
    super("reply_failed", why);
    this.name = "ReplyFailureError";
    this.text = text;
    this.where = where;
  }
}

// Posts the owner's accepted-risk reply where noslop reads it, as the login gh runs under: in the
// finding's thread on the diff, else (a finding outside the diff) as an issue comment on the PR. A
// reply that already stands is not posted again.
export async function postAcceptRiskReply(
  run: Runner,
  ref: PRRef,
  input: AcceptRiskReplyInput,
): Promise<PostedReply> {
  const text = buildAcceptRiskReply(input, "thread");
  const issueText = buildAcceptRiskReply(input, "issue");
  const standingLine = `${input.finding} accepted-risk`;
  const generalWhere = `the finding's thread or the issue comments of ${ref.slug}#${ref.pr}`;
  const reviewPath = `repos/${ref.slug}/pulls/${ref.pr}/comments`;
  const issuePath = `repos/${ref.slug}/issues/${ref.pr}/comments`;
  const review = await readOrFail(run, reviewPath, text, generalWhere);
  const thread = findFindingComment(review, input.finding);
  if (thread !== undefined) {
    const standing = review.find(
      (comment) =>
        comment.replyTo === thread.id && isOwner(comment) && comment.body.startsWith(standingLine),
    );
    if (standing !== undefined) {
      return { reply: "already-posted", url: standing.url, text };
    }
    return await post(
      run,
      `${reviewPath}/${thread.id}/replies`,
      text,
      `the thread of the finding's comment ${thread.url}`,
    );
  }
  const general = await readOrFail(run, issuePath, issueText, generalWhere);
  if (findFindingComment(general, input.finding) === undefined) {
    throw new HqError(
      "not_found",
      `no noslop comment holds finding ${input.finding} on ${ref.slug}#${ref.pr}, in a thread on the diff or among the PR's issue comments, so there is nowhere to post the reply; the record stands, and a rerun posts it once the finding's comment exists`,
    );
  }
  const standing = general.find(
    (comment) => isOwner(comment) && comment.body.startsWith(standingLine),
  );
  if (standing !== undefined) {
    return { reply: "already-posted", url: standing.url, text: issueText };
  }
  return await post(run, issuePath, issueText, `the issue comments of ${ref.slug}#${ref.pr}`);
}

async function readOrFail(
  run: Runner,
  path: string,
  text: string,
  where: string,
): Promise<PRComment[]> {
  try {
    return await readPRComments(run, path);
  } catch (error) {
    throw new ReplyFailureError(
      `the reply was not posted: ${error instanceof Error ? error.message : String(error)}`,
      text,
      where,
    );
  }
}

// A top-level comment of the noslop App that holds the finding's id.
function findFindingComment(
  comments: readonly PRComment[],
  finding: string,
): PRComment | undefined {
  return comments.find(
    (comment) =>
      (comment.replyTo ?? null) === null &&
      comment.type === "Bot" &&
      comment.body.includes(finding),
  );
}

function isOwner(comment: PRComment): boolean {
  return comment.login?.toLowerCase() === OWNER;
}

async function post(run: Runner, path: string, text: string, where: string): Promise<PostedReply> {
  try {
    const result = await boundedRunner(
      run,
      CALL_MS,
    )(["gh", "api", "-X", "POST", path, "-f", `body=${text}`, "--jq", ".html_url"]);
    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout).trim().slice(0, 300));
    }
    return { reply: "posted", url: result.stdout.trim(), text };
  } catch (error) {
    throw new ReplyFailureError(
      `the reply was not posted: gh api POST ${path} failed (${error instanceof Error ? error.message : String(error)})`,
      text,
      where,
    );
  }
}
