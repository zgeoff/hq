export interface Judged<T> {
  value: T | null;
  why: string | null;
  failedCalls: number;
}

// A finding as hq stores it in noslop_rounds.findings. Rows from before 0.59.0 hold only the first four fields.
export interface StoredFinding {
  id: string;
  lens: string;
  severity: string;
  title: string;
  criterion?: string | null | undefined;
  rule?: string | null | undefined;
  path?: string | null | undefined;
  startLine?: number | null | undefined;
  endLine?: number | null | undefined;
  writtenByChange?: boolean | null | undefined;

  // Whether the finding landed on code the PR had not changed since its first review: set at record time only.
  late?: boolean | null | undefined;
}

// One held file's unified=0 diff between the merge base and the head.
export interface HeldDiff {
  path: string;
  diff: string;
}

// A claim that a link or path target moved from one file to another. Each candidate is the old and
// new path resolved one way (relative to the file, or to the repo root); the claim holds when any
// candidate is proved.
export interface MoveClaim {
  path: string;
  line: number;
  candidates: [from: string, to: string][];
}

// What git says about the paths of the claims: each path's tree entry as `<mode> <type> <object>`,
// null when the path is absent.
export interface MoveFacts {
  baseBlobs: Map<string, string | null>;
  headBlobs: Map<string, string | null>;
  renames: Set<string>;
}

export type MechanicalProof = { pass: true; files: string[]; lines: number } | { pass: false; reason: string };
