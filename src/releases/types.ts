import type { Build } from '../build/read-build.ts';
import type { Runner } from '../runner/types.ts';
import type { Gate } from './parse-gate.ts';

// A ref source with `gated` holds a PR that changes a path of that gate only once `gated.ref` holds it too.
export type Source = { kind: 'releases'; tag: RegExp } | { kind: 'ref'; ref: string; gated?: { gate: string; ref: string } } | { kind: 'packages' } | { kind: 'build' } | { kind: 'merge' };

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
  // Deploy-held runs left alone: held after the releases that hold their PRs.
  held: string[];
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
  readGate: (repo: string, name: string) => Promise<Gate | null>;
  isCapped: () => boolean;
  hasFailed: (repo: string) => boolean;
}
