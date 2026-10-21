import type { Build } from '../build/read-build.ts';
import type { Runner } from '../runner/types.ts';

export type Source = { kind: 'releases'; tag: RegExp } | { kind: 'ref'; ref: string } | { kind: 'packages' } | { kind: 'build' } | { kind: 'merge' };

export interface Release {
  tag: string;
  at: string | null; // published_at; null for a moving tag
}

export interface ShipMove {
  issue: string;
  to: 'live-check' | 'done';
  prs: { ref: string; tag: string | null; shipped_at: string }[];
}

export interface ShipResult {
  dryRun: boolean;
  moved: ShipMove[];
  shippedPrs: number; // PRs newly found in a release (stored unless a dry run)
  compares: number;
  deferred: number; // PRs left for the next pass by the compare cap
  errors: string[];
}

export interface PrState {
  ref: string;
  repo: string;
  sha: string | null;
  tag: string | null;
  at: string | null;
  mergedAt: string | null;
}

export interface Shipment {
  tag: string | null;
  at: string | null;
}

export interface ShipDeps {
  run: Runner;
  readBuild: () => Build;
  contains: (repo: string, sha: string, tag: string) => Promise<boolean | 'cap'>;
  getReleases: (repo: string) => Promise<Release[] | null>;
  isCapped: () => boolean;
  hasFailed: (repo: string) => boolean;
}
