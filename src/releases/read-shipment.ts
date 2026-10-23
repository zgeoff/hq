import { match } from 'ts-pattern';
import { isGateTouched } from './is-gate-touched.ts';
import { isNotFound } from './is-not-found.ts';
import { readChangedFiles } from './read-changed-files.ts';
import { readOldestContaining } from './read-oldest-containing.ts';
import { readPackageRelease } from './read-package-release.ts';
import { getPRNumber } from './get-pr-number.ts';
import { getSource } from './get-source.ts';
import { readChangedPrefixes } from './read-changed-prefixes.ts';
import type { PrState, ShipDeps, Shipment, Source } from './types.ts';

export function readShipment(deps: ShipDeps, state: PrState, sha: string): Promise<Shipment | null | 'cap'> {
  return match(getSource(state.repo))
    .with({ kind: 'merge' }, () => Promise.resolve({ tag: null, at: state.mergedAt }))
    .with({ kind: 'build' }, () => readBuildShipment(deps, state, sha))
    .with({ kind: 'packages' }, () => readPackagesShipment(deps, state, sha))
    .with({ kind: 'releases' }, () => readReleaseShipment(deps, state, sha))
    .with({ kind: 'ref' }, (source) => readRefShipment(deps, state, sha, source))
    .exhaustive();
}

// A source run or a dirty build is no commit GitHub can compare, so it ships nothing and is no error.
async function readBuildShipment(deps: ShipDeps, state: PrState, sha: string): Promise<Shipment | null | 'cap'> {
  const build = deps.readBuild();
  if (!build.commit || build.dirty !== false) {
    return null;
  }
  // A build from an unpushed commit waits.
  const held = await readHeld(deps, state.repo, sha, build.commit);
  if (held === 'cap') {
    return 'cap';
  }
  return held ? { tag: `build:${build.commit.slice(0, 7)}`, at: null } : null;
}

async function readPackagesShipment(deps: ShipDeps, state: PrState, sha: string): Promise<Shipment | null | 'cap'> {
  if (deps.hasFailed(state.repo)) {
    return null;
  }
  if (deps.isCapped()) {
    return 'cap';
  }
  const prefixes = await readChangedPrefixes(deps.run, state.repo, getPRNumber(state.ref), sha);
  if (prefixes.length === 0) {
    return { tag: null, at: state.mergedAt };
  }
  const list = await deps.getReleases(state.repo);
  return list ? readPackageRelease(list, prefixes, (tag) => deps.contains(state.repo, sha, tag)) : null;
}

async function readReleaseShipment(deps: ShipDeps, state: PrState, sha: string): Promise<Shipment | null | 'cap'> {
  const list = await deps.getReleases(state.repo);
  return list ? readOldestContaining(list, (tag) => deps.contains(state.repo, sha, tag)) : null;
}

// A gated PR needs the gate's ref as well as the source's. That ref may not exist yet, which holds nothing.
async function readRefShipment(deps: ShipDeps, state: PrState, sha: string, source: Extract<Source, { kind: 'ref' }>): Promise<Shipment | null | 'cap'> {
  const found = await readReleaseShipment(deps, state, sha);
  const gated = source.gated;
  if (found === null || found === 'cap' || gated === undefined) {
    return found;
  }
  const gate = await deps.getGate(state.repo, gated.gate);
  if (gate === null) {
    return null;
  }
  const files = await readChangedFiles(deps.run, state.repo, getPRNumber(state.ref));
  if (!isGateTouched(gate, files)) {
    return found;
  }
  const held = await readHeld(deps, state.repo, sha, gated.ref);
  if (held === 'cap') {
    return 'cap';
  }
  return held ? { tag: gated.ref, at: null } : null;
}

function readHeld(deps: ShipDeps, repo: string, sha: string, head: string): Promise<boolean | 'cap'> {
  return deps.contains(repo, sha, head).catch((error: unknown) => {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  });
}
