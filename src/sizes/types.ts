import type { Size } from './bands.ts';

export interface PRFacts {
  lines: number;
  stacked: boolean;
}

export interface SizedRun {
  issue: string;
  size: Size | null;
  size_lines: number | null;
  lastMerge: string;
  prs: { ref: string; url: string | null }[];
}

export interface SizeRow {
  issue: string;
  size: Size;
  guess: number;
  actual: number;
  actualBand: Size;
  ratio: number;
}

export interface SizeStats {
  runs: number;
  unread: number;
  unsized: number;
  byBand: Record<Size, { n: number; medianRatio: number | null; medianActual: number | null; outside: number; thin: boolean }>;
  rows: SizeRow[];
  stacked: number;
  stackShare: number | null;
}
