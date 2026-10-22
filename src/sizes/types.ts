import type { Size } from './bands.ts';

// ---------- GitHub facts for merged PRs ----------

export interface PrFacts {
  lines: number; // additions + deletions
  stacked: boolean; // based on another PR's branch at any point
}

export interface SizedRun {
  issue: string;
  size: Size | null;
  size_lines: number | null;
  lastMerge: string;
  prs: { ref: string; url: string | null }[];
}

// ---------- the stats section ----------

export interface SizeRow {
  issue: string;
  size: Size;
  guess: number;
  actual: number;
  actualBand: Size;
  ratio: number;
}

export interface SizeStats {
  runs: number; // merged runs in the window
  unread: number; // runs with a merged PR GitHub didn't report
  unsized: number;
  byBand: Record<Size, { n: number; medianRatio: number | null; medianActual: number | null; outside: number; thin: boolean }>;
  rows: SizeRow[];
  stacked: number;
  stackShare: number | null;
}
