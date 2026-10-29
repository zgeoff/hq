import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { addNews } from '../news/add-news.ts';
import { readChangedDiffFiles } from '../noslop/read-changed-diff-files.ts';
import { readMergeBase } from '../noslop/read-merge-base.ts';
import { runMissingFetch } from '../noslop/run-missing-fetch.ts';
import { checkout } from '../review/checkout.ts';
import { buildCarriedNote } from './build-carried-note.ts';
import { buildRebasedRefusal } from './build-rebased-refusal.ts';
import { readDiffPatchID } from './read-diff-patch-id.ts';
import { formatRebasedNews } from './format-rebased-news.ts';
import { getAnswerHead } from './get-answer-head.ts';
import type { PRCommandInput } from './run-pr-command.ts';
import type { PRRef } from './parse-pr-ref.ts';
import { readHeadLgtm } from './read-head-lgtm.ts';
import { readPRAnswers } from './read-pr-answers.ts';
import { readPRShas } from './read-pr-shas.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';
import { recordPRAnswer } from './record-pr-answer.ts';
import { requireCarriableLgtm } from './require-carriable-lgtm.ts';
import { requireReviewer } from './require-reviewer.ts';

const FROM = /^[0-9a-f]{7,40}$/iu;

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
  const shas = await readPRShas(input.run, ref.slug, ref.pr);
  if (shas === null) {
    throw new HqError('head_unreadable', `could not read ${ref.slug}#${ref.pr}'s head and base with gh, so no record is stored (it would have no head to be stale against)`);
  }
  const newHead = shas.head;
  if (newHead === oldHead) {
    throw new HqError('bad_args', `${ref.slug}#${ref.pr} is still at ${oldHead.slice(0, 7)}, so there is nothing to carry`);
  }
  const heads = { base: shas.base, oldHead, newHead };
  const patchID = await matchPatchIDs(input, ref, heads);
  return carry(input, { ref, actor, lgtm, oldHead, newHead, patchID });
}

interface Heads {
  base: string;
  oldHead: string;
  newHead: string;
}

async function matchPatchIDs(input: PRCommandInput, ref: PRRef, heads: Heads): Promise<string> {
  const directory = await checkout(input.run, ref.slug, ref.repo).catch(() => null);
  if (directory === null) {
    throw new HqError('git_unreadable', `hq could not get a checkout of ${ref.slug}, so the diffs are not compared and nothing is recorded`);
  }
  if (!(await runMissingFetch(input.run, directory, [heads.oldHead, heads.newHead, heads.base]))) {
    throw new HqError('git_unreadable', `git cannot fetch the heads and the base ${heads.base.slice(0, 7)} of ${ref.slug}#${ref.pr}, so the diffs are not compared and nothing is recorded`);
  }
  const oldPatchID = await readDiffPatchID(input.run, directory, heads.base, heads.oldHead);
  const newPatchID = await readDiffPatchID(input.run, directory, heads.base, heads.newHead);
  if (oldPatchID.kind === 'patch-id' && newPatchID.kind === 'patch-id' && oldPatchID.id === newPatchID.id) {
    return oldPatchID.id;
  }
  const changed = oldPatchID.kind === 'patch-id' && newPatchID.kind === 'patch-id' ? await compareFiles(input, directory, heads) : null;
  throw buildRebasedRefusal({ slug: ref.slug, pr: ref.pr, oldHead: heads.oldHead, newHead: heads.newHead, oldPatchID, newPatchID, changed });
}

async function compareFiles(input: PRCommandInput, directory: string, heads: Heads): Promise<string[] | null> {
  const oldBase = await readMergeBase(input.run, directory, heads.base, heads.oldHead);
  const newBase = await readMergeBase(input.run, directory, heads.base, heads.newHead);
  if (oldBase === null || newBase === null) {
    return null;
  }
  return await readChangedDiffFiles(input.run, directory, { from: oldBase, to: heads.oldHead }, { from: newBase, to: heads.newHead });
}

interface Carry {
  ref: PRRef;
  actor: string;
  lgtm: OwnerAnswer;
  oldHead: string;
  newHead: string;
  patchID: string;
}

function carry(input: PRCommandInput, request: Carry): Out {
  const ref = request.ref;
  const lgtm = request.lgtm;
  const source = `rebased:${request.oldHead}`;
  const words = lgtm.carried ?? { source: lgtm.source, note: lgtm.note };
  const carried = { ...words, patchID: request.patchID };
  const note = buildCarriedNote(words, request.patchID);
  const text = formatRebasedNews(request.actor, { repo: ref.repo, pr: ref.pr, oldHead: request.oldHead, newHead: request.newHead });
  input.db
    .transaction(() => {
      requireCarriableLgtm(input.db, { repo: ref.repo, pr: ref.pr, lgtm, oldHead: request.oldHead, newHead: request.newHead });
      recordPRAnswer(input.db, { repo: ref.repo, pr: ref.pr, answer: 'lgtm', head: request.newHead, source, note, actor: request.actor, carried });
      addNews(input.db, { from: request.actor, topic: 'merge', text, issue: null, link: null, needsGeoff: false });
    })
    .immediate();
  return { data: { rebased: { repo: ref.repo, pr: ref.pr, from: request.oldHead, head: request.newHead, source, carried } }, text: `Recorded ${text}` };
}
