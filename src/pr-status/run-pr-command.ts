// `hq pr status`, `hq pr answer`, `hq pr override`, `hq pr accept-risk` and `hq pr next`: the one
// record every session reads before it messages another session about a PR. Only an override and an
// accepted risk change what the merge gate passes.
import type { Database } from 'bun:sqlite';
import type { Flags } from '../cli.ts';
import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import type { PRStatusRow } from '../kdb.ts';
import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { roleName } from '../roles/role-name.ts';
import type { Runner } from '../runner/types.ts';
import { buildPRStatusView } from './build-pr-status-view.ts';
import { findOwnerOverride } from './find-owner-override.ts';
import type { OwnerOverride } from './find-owner-override.ts';
import { findSourceRefusal } from './find-source-refusal.ts';
import type { OwnerAction } from './find-source-refusal.ts';
import { findPRStatus } from './find-pr-status.ts';
import { formatOverrideLine } from './format-override-line.ts';
import { formatPRStatus } from './format-pr-status.ts';
import { hasPROverride } from './has-pr-override.ts';
import { parsePRRef } from './parse-pr-ref.ts';
import type { PRRef } from './parse-pr-ref.ts';
import type { OwnerProbe } from './read-owner-session.ts';
import { readPRHead } from './read-pr-head.ts';
import { recordPRAnswer } from './record-pr-answer.ts';
import { recordPRAcceptedRisk } from './record-pr-accepted-risk.ts';
import { recordPROverride } from './record-pr-override.ts';
import { recordPRNext } from './record-pr-next.ts';
import { requireAnswerSource } from './require-answer-source.ts';
import type { PRAnswer, PRStatusView } from './types.ts';
import { updatePRHead } from './update-pr-head.ts';

export interface PRCommandInput {
  run: Runner;
  db: Database;
  verb: string | undefined;
  rest: string[];
  flags: Flags;
  actor: () => Promise<string>;
  readOwnerSession: () => Promise<OwnerProbe>;
}

const ANSWERS = new Set(['lgtm', 'changes', 'reject']),
  NEXT_USAGE = 'usage: hq pr next <repo> <pr> <session> | --clear';

export async function runPRCommand(input: PRCommandInput): Promise<Out> {
  const [rawRepo, rawPR, third] = input.rest;
  if (input.verb === 'status') {
    return await runStatus(input, parsePRRef(rawRepo, rawPR));
  }
  if (input.verb === 'answer') {
    return await runAnswer(input, parsePRRef(rawRepo, rawPR), third);
  }
  if (input.verb === 'override') {
    return await runOverride(input, parsePRRef(rawRepo, rawPR));
  }
  if (input.verb === 'accept-risk') {
    return await runAcceptRisk(input, parsePRRef(rawRepo, rawPR), third);
  }
  if (input.verb === 'next') {
    return await runNext(input, parsePRRef(rawRepo, rawPR), third);
  }
  throw new HqError('bad_args', 'usage: hq pr status|answer|override|accept-risk|next <repo> <pr>');
}

async function runStatus(input: PRCommandInput, ref: PRRef): Promise<Out> {
  const row = await findPRStatus(input.db, ref.repo, ref.pr);
  if (row === null) {
    return await readUnrecordedStatus(input, ref);
  }
  return await refreshStatus(input, ref, row);
}

// A PR with no record may still hold the owner's override, which the reviewer needs to see; gh is
// read only when an override was ever recorded.
async function readUnrecordedStatus(input: PRCommandInput, ref: PRRef): Promise<Out> {
  const none: Out = { data: { pr: null }, text: `No record for ${ref.repo}#${ref.pr}.` };
  if (!hasPROverride(input.db, ref.repo, ref.pr)) {
    return none;
  }
  const head = await readPRHead(input.run, ref.slug, ref.pr);
  const override = findStandingOverride(input, ref, head);
  if (override === null) {
    return none;
  }
  const shown = { head: override.head, source: override.source, note: override.note, at: override.at };
  return { data: { pr: null, override: shown }, text: `${none.text}\n${formatOverrideLine(shown)}` };
}

// The override that stands at the head now; none when the head is unknown.
function findStandingOverride(input: PRCommandInput, ref: PRRef, head: string | null): OwnerOverride | null {
  return head === null ? null : findOwnerOverride(input.db, ref.repo, ref.pr, head);
}

// The record against the head gh gives now; that head is also stored as the one hq last saw.
async function refreshStatus(input: PRCommandInput, ref: PRRef, row: PRStatusRow): Promise<Out> {
  const current = await readPRHead(input.run, ref.slug, ref.pr);
  if (current !== null) {
    await updatePRHead(input.db, ref.repo, ref.pr, current);
  }
  return buildOut(buildPRStatusView(row, current, findStandingOverride(input, ref, current)));
}

function buildOut(view: PRStatusView): Out {
  return { data: { pr: view }, text: formatPRStatus(view) };
}

interface AnswerArgs {
  answer: PRAnswer;
  note: string | null;
  source: string;
}

async function runAnswer(input: PRCommandInput, ref: PRRef, rawAnswer: string | undefined): Promise<Out> {
  const args = parseAnswerArgs(input.flags, rawAnswer),
    context = await readAnswerContext(input, ref);
  await recordPRAnswer(input.db, { repo: ref.repo, pr: ref.pr, ...args, head: context.head, actor: context.actor });
  return await readOut(input, ref, context.head);
}

function parseAnswerArgs(flags: Flags, rawAnswer: string | undefined): AnswerArgs {
  const note = flags.note?.trim() ?? '',
    source = requireAnswerSource(flags.source);
  if (rawAnswer === undefined || !ANSWERS.has(rawAnswer)) {
    throw new HqError('bad_args', 'the answer must be lgtm, changes or reject');
  }
  if (rawAnswer === 'changes' && note === '') {
    throw new HqError('bad_args', "'changes' needs --note: what the owner asked to change");
  }
  return { answer: rawAnswer as PRAnswer, note: note === '' ? null : note, source };
}

async function runOverride(input: PRCommandInput, ref: PRRef): Promise<Out> {
  const source = await requireOwnerSource(input, ref, { action: 'override' });
  const note = input.flags.note?.trim() ?? '';
  if (note === '') {
    throw new HqError('bad_args', '--note is required: why the owner overrides the open findings at this head');
  }
  const context = await readAnswerContext(input, ref);
  recordPROverride(input.db, { repo: ref.repo, pr: ref.pr, head: context.head, source, note, actor: context.actor });
  return { data: { override: { repo: ref.repo, pr: ref.pr, head: context.head, source, note } }, text: `Recorded the owner's override of the open findings for ${ref.repo}#${ref.pr} at ${context.head.slice(0, 7)} (${source}): ${note}` };
}

async function requireOwnerSource(input: PRCommandInput, ref: PRRef, wanted: OwnerAction): Promise<string> {
  const source = requireAnswerSource(input.flags.source);
  const probe: OwnerProbe = source.startsWith('chat:') ? await input.readOwnerSession() : { verdict: 'other' };
  const refusal = findSourceRefusal(input.db, { ref, wanted, source }, probe);
  if (refusal !== null) {
    throw new HqError('bad_args', `--source refused: ${refusal}; ask ${roleName('owner')} to record it`);
  }
  return source;
}

async function readAnswerContext(input: PRCommandInput, ref: PRRef): Promise<{ head: string; actor: string }> {
  const actor = await input.actor(),
    head = await readPRHead(input.run, ref.slug, ref.pr);
  if (head === null) {
    throw new HqError('head_unreadable', `could not read ${ref.slug}#${ref.pr}'s head with gh, so no answer is stored (it would have no head to be stale against)`);
  }
  return { head, actor };
}

async function runAcceptRisk(input: PRCommandInput, ref: PRRef, finding: string | undefined): Promise<Out> {
  if (finding === undefined || finding.trim() === '') {
    throw new HqError('bad_args', 'usage: hq pr accept-risk <repo> <pr> <finding-id> --source S --note T');
  }
  const source = await requireOwnerSource(input, ref, { action: 'accept-risk', finding });
  const note = input.flags.note?.trim() ?? '';
  if (note === '') {
    throw new HqError('bad_args', '--note is required: why the owner accepts this risk');
  }
  recordPRAcceptedRisk(input.db, { repo: ref.repo, pr: ref.pr, finding, source, note, actor: await input.actor() });
  return { data: { acceptedRisk: { repo: ref.repo, pr: ref.pr, finding, source, note } }, text: `Recorded the owner's acceptance of the risk of finding ${finding} for ${ref.repo}#${ref.pr} (${source}): ${note}` };
}

async function runNext(input: PRCommandInput, ref: PRRef, session: string | undefined): Promise<Out> {
  const actor = await input.actor(),
    holder = requireNextHolder(input.flags, session);
  await recordPRNext(input.db, ref, holder, actor);
  return await refreshWrittenStatus(input, ref);
}

// The record just written, against the head gh gives now, as `hq pr status` shows it.
async function refreshWrittenStatus(input: PRCommandInput, ref: PRRef): Promise<Out> {
  const row = await readWrittenRow(input, ref);
  return await refreshStatus(input, ref, row);
}

// The session that holds the next step, or null for --clear. Exactly one of the two is given, and
// the session is a declared one.
function requireNextHolder(flags: Flags, session: string | undefined): string | null {
  const clear = flags.clear === true,
    names = getDeclaredSessions().map((s) => s.name);
  if (clear && session !== undefined) {
    throw new HqError('bad_args', `give a session or --clear, not both; ${NEXT_USAGE}`);
  }
  if (clear) {
    return null;
  }
  if (session === undefined) {
    throw new HqError('bad_args', NEXT_USAGE);
  }
  if (!names.includes(session)) {
    throw new HqError('bad_args', `"${session}" is not a declared session; declared: ${names.join(', ')} (or --clear)`);
  }
  return session;
}

// The record after an answer, against the head that answer was just stored at.
async function readOut(input: PRCommandInput, ref: PRRef, head: string): Promise<Out> {
  const row = await readWrittenRow(input, ref);
  return buildOut(buildPRStatusView(row, head, findStandingOverride(input, ref, head)));
}

async function readWrittenRow(input: PRCommandInput, ref: PRRef): Promise<PRStatusRow> {
  const row = await findPRStatus(input.db, ref.repo, ref.pr);
  if (row === null) {
    throw new HqError('not_found', `no record for ${ref.repo}#${ref.pr} after the write`);
  }
  return row;
}
