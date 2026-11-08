export interface HeldDiff {
  path: string;
  diff: string;
}

export interface MoveClaim {
  path: string;
  line: number;
  candidates: [from: string, to: string][];
}

export interface MoveFacts {
  baseBlobs: Map<string, string | null>;
  headBlobs: Map<string, string | null>;
  renames: Set<string>;
}

export type MechanicalProof = { pass: true; files: string[]; lines: number } | { pass: false; reason: string };
