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

// What git says about the paths of the claims. A blob id is null when the path is absent.
export interface MoveFacts {
  baseBlobs: Map<string, string | null>;
  headBlobs: Map<string, string | null>;
  renames: Set<string>;
}

export type MechanicalProof = { pass: true; files: string[]; lines: number } | { pass: false; reason: string };
