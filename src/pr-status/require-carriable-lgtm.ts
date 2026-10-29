import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { readHeadLgtm } from './read-head-lgtm.ts';
import { readPRAnswers } from './read-pr-answers.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';

export interface CarriableLgtm {
  repo: string;
  pr: number;
  lgtm: OwnerAnswer;
  newHead: string;
}

// Run inside the write transaction: the fetch before it is slow, and the owner may have answered
// meanwhile. A carried lgtm must never override a later word of the owner's.
export function requireCarriableLgtm(db: Database, request: CarriableLgtm): void {
  const repo = request.repo;
  const pr = request.pr;
  const lgtm = request.lgtm;
  const newHead = request.newHead;
  const answers = readPRAnswers(db, repo, pr);
  if (answers === null) {
    throw new HqError('bad_args', `an answer record of ${repo}#${pr} cannot be read, so no lgtm is carried`);
  }
  const oldHead = lgtm.head ?? '';
  if (readHeadLgtm(db, repo, pr, oldHead)?.seq !== lgtm.seq) {
    throw new HqError('bad_args', `the owner's lgtm at ${oldHead.slice(0, 7)} of ${repo}#${pr} is no longer the newest answer there, so it is not carried`);
  }
  const atNew = answers.find((answer) => answer.head === newHead);
  if (atNew !== undefined) {
    throw new HqError('bad_args', `the owner already answered ${atNew.answer} at ${newHead.slice(0, 7)} of ${repo}#${pr}, so the lgtm is not carried over it`);
  }
}
