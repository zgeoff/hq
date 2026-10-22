import type { Database } from 'bun:sqlite';
import type { Runner } from '../runner/types.ts';
import type { ReviewFinding } from './parse-review-run.ts';
import type { StoredFinding } from './types.ts';

export interface LateInput {
  run: Runner;
  db: Database;
  repo: string;
  pr: number;

  // The checkout the PR heads are fetched into.
  dir: string;
  head: string | null;
  findings: ReviewFinding[];
}

interface PriorReview {
  head: string | null;
  findings: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,(?<length>\d+))? @@/u,
  MISSING_PATH = /does not exist|exists on disk, but not in/u;

// For each new finding of a PR's later review: whether it anchors in code the PR had not changed since its
// first review (true), or in code it had changed or added (false). Null where that cannot be told. The map
// holds an entry for every finding id; a git failure never throws.
export async function collectLateFlags(input: LateInput): Promise<Map<string, boolean | null>> {
  const flags = new Map<string, boolean | null>(input.findings.map((f) => [f.id, null])),
    prior = readPriorReviews(input);
  await updateLateFlags(input, flags, prior);
  return flags;
}

async function updateLateFlags(input: LateInput, flags: Map<string, boolean | null>, prior: PriorReview[]): Promise<void> {
  const first = prior[0]?.head ?? null,
    fresh = pickFreshFindings(input, prior),
    paths = [...new Set(fresh.map((f) => f.anchor?.path ?? ''))];
  if (first === null || input.head === null || fresh.length === 0) {
    return;
  }
  if (!(await checkCommitExists(input, first))) {
    return;
  }
  for (const path of paths) {
    const hunks = await readHunks(input, first, input.head, path);
    for (const finding of fresh.filter((f) => f.anchor?.path === path)) {
      flags.set(finding.id, buildLateFlag(hunks, finding));
    }
  }
}

// The anchored findings no earlier ok review of the PR raised.
function pickFreshFindings(input: LateInput, prior: PriorReview[]): ReviewFinding[] {
  const seen = new Set(prior.flatMap((r) => (JSON.parse(r.findings) as StoredFinding[]).map((f) => f.id)));
  return input.findings.filter((f) => !seen.has(f.id) && f.anchor !== undefined);
}

function readPriorReviews(input: LateInput): PriorReview[] {
  return input.db.query("SELECT head, findings FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 ORDER BY id").all(input.repo, input.pr) as PriorReview[];
}

async function checkCommitExists(input: LateInput, sha: string): Promise<boolean> {
  try {
    const result = await input.run(['git', 'cat-file', '-e', `${sha}^{commit}`], { cwd: input.dir });
    return result.code === 0;
  } catch {
    return false;
  }
}

interface Span {
  start: number;
  end: number;
}

type Hunks = Span[] | 'new' | null;

// The new-side line ranges the PR changed in the file: null when git cannot say, an empty list when the
// file is unchanged, and 'new' when the file did not exist at the first head.
async function readHunks(input: LateInput, first: string, head: string, path: string): Promise<Hunks> {
  try {
    return await readFileHunks(input, first, head, path);
  } catch {
    return null;
  }
}

async function readFileHunks(input: LateInput, first: string, head: string, path: string): Promise<Hunks> {
  const exists = await input.run(['git', 'cat-file', '-e', `${first}:${path}`], { cwd: input.dir });
  if (exists.code !== 0) {
    return MISSING_PATH.test(exists.stderr) ? 'new' : null;
  }
  return await readDiffHunks(input, first, head, path);
}

async function readDiffHunks(input: LateInput, first: string, head: string, path: string): Promise<Hunks> {
  const diff = await input.run(['git', 'diff', '-U0', first, head, '--', path], { cwd: input.dir });
  return diff.code === 0 ? parseHunks(diff.stdout) : null;
}

function parseHunks(diff: string): Span[] {
  const spans: Span[] = [];
  for (const line of diff.split('\n')) {
    const groups = HUNK_HEADER.exec(line)?.groups;
    if (groups !== undefined) {
      const length = groups['length'] === undefined ? 1 : Number(groups['length']),
        start = Number(groups['start']);
      spans.push({ start, end: length === 0 ? start : start + length - 1 });
    }
  }
  return spans;
}

function buildLateFlag(hunks: Hunks, finding: ReviewFinding): boolean | null {
  if (hunks === null || finding.anchor === undefined) {
    return null;
  }
  if (hunks === 'new') {
    return false;
  }
  const end = finding.anchor.endLine,
    start = finding.anchor.startLine;
  return !hunks.some((h) => h.start <= end && h.end >= start);
}
