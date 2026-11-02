import type { Database } from 'bun:sqlite';
import type { Runner } from '../runner/types.ts';

export interface PRRequest {
  run: Runner;
  db: Database;
  rawRepo: string;
  pr: number;
  owner?: string | undefined;
  repoDir?: string | undefined;
}

export interface Judged<T> {
  value: T | null;
  why: string | null;
  failedCalls: number;
}

// Rows from before 0.59.0 hold only the first four fields.
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

  late?: boolean | null | undefined;
}

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

export interface OpenFinding {
  id: string;
  title: string;
  reason: string;
}
