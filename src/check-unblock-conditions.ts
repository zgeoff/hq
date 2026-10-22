import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { findSubjectLink } from './find-subject-link.ts';
import type { LinearCall } from './linear/types.ts';
import type { PRRef } from './parse-pr-url.ts';
import { parsePRURL } from './parse-pr-url.ts';
import type { Runner } from './runner/types.ts';
import { dropUnblock } from './unblock/drop-unblock.ts';
import { listUnblocks } from './unblock/list-unblocks.ts';
import { makeConditionReader } from './unblock/make-condition-reader.ts';
import { readIssueVerdicts } from './unblock/read-issue-verdicts.ts';
import { pickClosure } from './unblock/pick-closure.ts';
import { settleUnblock } from './unblock/settle-unblock.ts';
import type { ConditionVerdict, DoneWhen, UnblockItem } from './unblock/types.ts';

export interface ConditionsDeps {
  call: LinearCall;
  run: Runner;
}

export interface ConditionsResult {
  settled: string[];
  dropped: string[];
  errors: string[];
}

export async function checkUnblockConditions(db: Database, deps: ConditionsDeps, actor: string): Promise<ConditionsResult> {
  const items = listUnblocks(db, 'open');
  const issueRefs = [...new Set(items.flatMap((item) => item.done_when.filter((condition) => condition.kind === 'issue').map((condition) => condition.ref)))];
  const issues = issueRefs.length > 0 ? await readIssueVerdicts(deps.call, issueRefs) : new Map<string, ConditionVerdict>();
  const readCondition = makeConditionReader({ ...deps, issues });
  const outcomes = await Promise.all(items.map((item) => checkItem({ actor, db, readCondition }, item)));
  return {
    settled: outcomes.flatMap((outcome) => (outcome.closed === 'done' ? [outcome.id] : [])),
    dropped: outcomes.flatMap((outcome) => (outcome.closed === 'dropped' ? [outcome.id] : [])),
    errors: outcomes.flatMap((outcome) => outcome.errors),
  };
}

interface ItemPass {
  actor: string;
  db: Database;
  readCondition: (condition: DoneWhen) => Promise<ConditionVerdict>;
}

interface ItemOutcome {
  id: string;
  closed: 'done' | 'dropped' | 'open';
  errors: string[];
}

async function checkItem(pass: ItemPass, item: UnblockItem): Promise<ItemOutcome> {
  const subject = findSubjectPR(item);
  const subjectRef = subject ? `${subject.owner}/${subject.repo}#${subject.number}` : null;
  const conditions = await Promise.all(item.done_when.map(async (condition) => ({ condition, verdict: await pass.readCondition(condition) })));
  const readSubject = subjectRef ? { ref: subjectRef, verdict: await pass.readCondition({ kind: 'pr', ref: subjectRef }) } : null;
  const errors = [...new Set([...conditions, readSubject].flatMap((read) => (read?.verdict.kind === 'failed' ? [`${item.id}: ${read.verdict.error}`] : [])))];
  const closure = pickClosure(conditions, readSubject);
  try {
    match(closure)
      .with({ to: 'done' }, (done) => settleUnblock(pass.db, item, done.note, pass.actor))
      .with({ to: 'dropped' }, (dropped) => dropUnblock(pass.db, item, dropped.note, pass.actor))
      .with({ to: 'open' }, () => null)
      .exhaustive();
  } catch (error) {
    // The owner closed it, or it was closed and reopened, between the list and now.
    return { id: item.id, closed: 'open', errors: [...errors, `${item.id}: ${error instanceof Error ? error.message : String(error)}`] };
  }
  return { id: item.id, closed: closure.to, errors };
}

function findSubjectPR(item: UnblockItem): PRRef | null {
  const link = findSubjectLink(item);
  return link ? parsePRURL(link.url) : null;
}
