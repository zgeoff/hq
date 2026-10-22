import { match } from 'ts-pattern';
import type { LinearCall } from '../linear/types.ts';
import type { Runner } from '../runner/types.ts';
import { parsePRCondition } from './parse-pr-condition.ts';
import { readDocumentVerdict } from './read-document-verdict.ts';
import { readPRVerdict } from './read-pr-verdict.ts';
import type { ConditionVerdict, DoneWhen } from './types.ts';

interface ConditionReaderDeps {
  call: LinearCall;
  run: Runner;
  issues: Map<string, ConditionVerdict>;
}

export function makeConditionReader(deps: ConditionReaderDeps): (condition: DoneWhen) => Promise<ConditionVerdict> {
  const reads = new Map<string, Promise<ConditionVerdict>>();
  return (condition) =>
    match(condition.kind)
      .with('issue', () => Promise.resolve(deps.issues.get(condition.ref) ?? { kind: 'waiting' as const }))
      .with('pr', () => readOnce(reads, `pr:${condition.ref}`, () => readPRCondition(deps.run, condition.ref)))
      .with('doc', () => readOnce(reads, `doc:${condition.ref}`, () => readDocumentVerdict(deps.call, condition.ref)))
      .exhaustive();
}

function readOnce(reads: Map<string, Promise<ConditionVerdict>>, key: string, read: () => Promise<ConditionVerdict>): Promise<ConditionVerdict> {
  const known = reads.get(key) ?? readSafely(read);
  reads.set(key, known);
  return known;
}

async function readSafely(read: () => Promise<ConditionVerdict>): Promise<ConditionVerdict> {
  try {
    return await read();
  } catch (error) {
    return { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

function readPRCondition(run: Runner, ref: string): Promise<ConditionVerdict> {
  const pr = parsePRCondition(ref);
  return pr === null ? Promise.resolve({ kind: 'failed', error: `cannot read pr:${ref} as owner/repo#n` }) : readPRVerdict(run, pr);
}
