import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { readOldestContaining } from './read-oldest-containing.ts';
import { readPackageRelease } from './read-package-release.ts';
import { getPRNumber } from './get-pr-number.ts';
import { getSource } from './get-source.ts';
import { readChangedPrefixes } from './read-changed-prefixes.ts';
import type { PrState, ShipDeps, Shipment } from './types.ts';

export function readShipment(deps: ShipDeps, state: PrState, sha: string): Promise<Shipment | null | 'cap'> {
  return match(getSource(state.repo))
    .with({ kind: 'merge' }, () => Promise.resolve({ tag: null, at: state.mergedAt }))
    .with({ kind: 'build' }, () => readBuildShipment(deps, state, sha))
    .with({ kind: 'packages' }, () => readPackagesShipment(deps, state, sha))
    .with({ kind: 'releases' }, { kind: 'ref' }, () => readReleaseShipment(deps, state, sha))
    .exhaustive();
}

// A source run or a dirty build is no commit GitHub can compare, so it ships nothing and is no error.
async function readBuildShipment(deps: ShipDeps, state: PrState, sha: string): Promise<Shipment | null | 'cap'> {
  const build = deps.readBuild();
  if (!build.commit || build.dirty !== false) {
    return null;
  }
  const held = await deps.contains(state.repo, sha, build.commit).catch((error: unknown) => {
    // gh reports a missing commit only in its stderr text: a build from an unpushed commit waits.
    if (error instanceof HqError && error.code === 'command_failed' && error.message.includes('(HTTP 404)')) {
      return false;
    }
    throw error;
  });
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
