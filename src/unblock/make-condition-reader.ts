import { match } from 'ts-pattern';
import type { LinearCall } from '../linear/types.ts';
import type { Runner } from '../runner/types.ts';
import { parsePRCondition } from './parse-pr-condition.ts';
import { readDocumentVerdict } from './read-document-verdict.ts';
import { readPRVerdict } from './read-pr-verdict.ts';
import { readReleaseList } from './read-release-list.ts';
import type { PublishedRelease } from './read-release-list.ts';
import type { ConditionVerdict, DoneWhen } from './types.ts';

interface ConditionReaderDeps {
  call: LinearCall;
  run: Runner;
  issues: Map<string, ConditionVerdict>;

  // When this pass reads: a date condition is settled once this reaches it.
  at: Date;
}

// The item a condition belongs to, as far as its verdict depends on it: a release settles only when
// published after the item was added.
interface ConditionOwner {
  added_at: string;
}

export function makeConditionReader(deps: ConditionReaderDeps): (condition: DoneWhen, owner: ConditionOwner) => Promise<ConditionVerdict> {
  const reads = new Map<string, Promise<ConditionVerdict>>();
  const releases = new Map<string, Promise<PublishedRelease[]>>();
  return (condition, owner) =>
    match(condition.kind)
      .with('issue', () => Promise.resolve(deps.issues.get(condition.ref) ?? { kind: 'waiting' as const }))
      .with('pr', () => readOnce(reads, `pr:${condition.ref}`, () => readPRCondition(deps.run, condition.ref)))
      .with('doc', () => readOnce(reads, `doc:${condition.ref}`, () => readDocumentVerdict(deps.call, condition.ref)))
      .with('release', () => readSafely(async () => pickReleaseVerdict(await readReleasesOnce(releases, deps.run, condition.ref), owner.added_at)))
      .with('date', () => Promise.resolve(pickDateVerdict(condition.ref, deps.at)))
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

function readReleasesOnce(releases: Map<string, Promise<PublishedRelease[]>>, run: Runner, repo: string): Promise<PublishedRelease[]> {
  const known = releases.get(repo) ?? readReleaseList(run, repo);
  releases.set(repo, known);
  return known;
}

function pickReleaseVerdict(releases: readonly PublishedRelease[], since: string): ConditionVerdict {
  const newer = releases.filter((release) => Date.parse(release.publishedAt) > Date.parse(since)).toSorted((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt));
  const first = newer.at(0);
  return first === undefined ? { kind: 'waiting' } : { kind: 'settled', what: `released ${first.tag}` };
}

function pickDateVerdict(ref: string, at: Date): ConditionVerdict {
  return at.getTime() >= Date.parse(ref) ? { kind: 'settled', what: 'passed' } : { kind: 'waiting' };
}
