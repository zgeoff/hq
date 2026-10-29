import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { addNews } from '../news/add-news.ts';
import { readChangedDiffFiles } from '../noslop/read-changed-diff-files.ts';
import { readMergeBase } from '../noslop/read-merge-base.ts';
import { readPRPatchID } from '../noslop/read-pr-patch-id.ts';
import { runMissingFetch } from '../noslop/run-missing-fetch.ts';
import { checkout } from '../review/checkout.ts';
import { buildCarriedNote } from './build-carried-note.ts';
import { buildRebasedRefusal } from './build-rebased-refusal.ts';
import { formatRebasedNews } from './format-rebased-news.ts';
import { getAnswerHead } from './get-answer-head.ts';
import type { PRCommandInput } from './run-pr-command.ts';
import type { PRRef } from './parse-pr-ref.ts';
import { readHeadLgtm } from './read-head-lgtm.ts';
import { readPRAnswers } from './read-pr-answers.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';
import { readPRBase } from './read-pr-base.ts';
import { readPRHead } from './read-pr-head.ts';
import { recordPRAnswer } from './record-pr-answer.ts';
import { requireCarriableLgtm } from './require-carriable-lgtm.ts';
import { requireReviewer } from './require-reviewer.ts';

const FROM = /^[0-9a-f]{7,40}$/iu;

// `hq pr rebased`: z-review carries the owner's lgtm from the old head to the head now when git's
// patch-id of the PR's whole diff, from its merge base with the base branch now, is the same at both.
// The record keeps whose words the lgtm was. A different or unreadable diff records nothing.
export async function runPRRebased(input: PRCommandInput, ref: PRRef): Promise<Out> {
  const actor = await input.actor();
  const session = await input.readReviewerSession();
  requireReviewer(actor, session);
  const prefix = input.flags.from?.trim() ?? '';
  if (!FROM.test(prefix)) {
    throw new HqError('bad_args', 'usage: hq pr rebased <repo> <pr> --from <old head>, with the old head a hex sha of 7 to 40 characters');
  }
  const answers = readPRAnswers(input.db, ref.repo, ref.pr);
  if (answers === null) {
    throw new HqError('bad_args', `an answer record of ${ref.repo}#${ref.pr} cannot be read, so no lgtm is carried`);
  }
  const oldHead = getAnswerHead(answers, prefix);
  const lgtm = readHeadLgtm(input.db, ref.repo, ref.pr, oldHead);
  if (lgtm === null) {
    throw new HqError('bad_args', `the owner's lgtm is not the newest answer at ${oldHead.slice(0, 7)} of ${ref.repo}#${ref.pr}, so there is none to carry`);
  }
  const newHead = await readPRHead(input.run, ref.slug, ref.pr);
  if (newHead === null) {
    throw new HqError('head_unreadable', `could not read ${ref.slug}#${ref.pr}'s head with gh, so no record is stored (it would have no head to be stale against)`);
  }
  if (newHead === oldHead) {
    throw new HqError('bad_args', `${ref.slug}#${ref.pr} is still at ${oldHead.slice(0, 7)}, so there is nothing to carry`);
  }
  const patchID = await matchPatchIDs(input, ref, { oldHead, newHead });
  return carry(input, { ref, actor, lgtm, newHead, patchID });
}

interface Heads {
  oldHead: string;
  newHead: string;
}

// The patch-id both heads share. Throws, naming the files that differ, when they do not share one.
async function matchPatchIDs(input: PRCommandInput, ref: PRRef, heads: Heads): Promise<string> {
  const base = await readPRBase(input.run, ref.slug, ref.pr);
  const directory = await checkout(input.run, ref.slug, ref.repo).catch(() => null);
  if (base === null || directory === null) {
    throw new HqError('git_unreadable', `hq could not ${base === null ? `read the base branch of ${ref.slug}#${ref.pr} from GitHub` : `get a checkout of ${ref.slug}`}, so the diffs are not compared and nothing is recorded`);
  }
  const baseRef = `refs/hq/base/${ref.pr}`;
  const fetched = await runMissingFetch(input.run, directory, [heads.oldHead, heads.newHead]);
  const baseFetch = fetched ? await input.run(['git', 'fetch', '-q', 'origin', `+${base}:${baseRef}`], { cwd: directory }) : null;
  if (baseFetch?.code !== 0) {
    throw new HqError('git_unreadable', `git cannot fetch the heads and ${base} of ${ref.slug}#${ref.pr}, so the diffs are not compared and nothing is recorded`);
  }
  const oldPatchID = await readPRPatchID(input.run, directory, baseRef, heads.oldHead);
  const newPatchID = await readPRPatchID(input.run, directory, baseRef, heads.newHead);
  if (oldPatchID !== null && oldPatchID === newPatchID) {
    return oldPatchID;
  }
  const changed = oldPatchID === null || newPatchID === null ? null : await compareFiles(input, directory, baseRef, heads);
  throw buildRebasedRefusal({ slug: ref.slug, pr: ref.pr, ...heads, oldPatchID, newPatchID, changed });
}

async function compareFiles(input: PRCommandInput, directory: string, baseRef: string, heads: Heads): Promise<string[] | null> {
  const oldBase = await readMergeBase(input.run, directory, baseRef, heads.oldHead);
  const newBase = await readMergeBase(input.run, directory, baseRef, heads.newHead);
  if (oldBase === null || newBase === null) {
    return null;
  }
  return await readChangedDiffFiles(input.run, directory, { from: oldBase, to: heads.oldHead }, { from: newBase, to: heads.newHead });
}

interface Carry {
  ref: PRRef;
  actor: string;
  lgtm: OwnerAnswer;
  newHead: string;
  patchID: string;
}

function carry(input: PRCommandInput, request: Carry): Out {
  const ref = request.ref;
  const lgtm = request.lgtm;
  const source = `rebased:${lgtm.head}`;
  const carried = { source: lgtm.source, note: lgtm.note, patchID: request.patchID };
  const note = buildCarriedNote(lgtm, request.patchID);
  const text = formatRebasedNews(request.actor, { repo: ref.repo, pr: ref.pr, oldHead: lgtm.head ?? '', newHead: request.newHead });
  input.db
    .transaction(() => {
      requireCarriableLgtm(input.db, ref.repo, ref.pr, lgtm, request.newHead);
      recordPRAnswer(input.db, { repo: ref.repo, pr: ref.pr, answer: 'lgtm', head: request.newHead, source, note, actor: request.actor, carried });
      addNews(input.db, { from: request.actor, topic: 'merge', text, issue: null, link: null, needsGeoff: false });
    })
    .immediate();
  return { data: { rebased: { repo: ref.repo, pr: ref.pr, from: lgtm.head, head: request.newHead, source, carried } }, text: `Recorded ${text}` };
}
