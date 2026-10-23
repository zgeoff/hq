import { match } from 'ts-pattern';
import { isNotFound } from './is-not-found.ts';
import { readChangedFiles } from './read-changed-files.ts';
import { readOldestContaining } from './read-oldest-containing.ts';
import { readPackageRelease } from './read-package-release.ts';
import { pickRefShipment } from './pick-ref-shipment.ts';
import type { RefFacts } from './pick-ref-shipment.ts';
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

// A head GitHub does not know, such as an unpushed commit or a ref not made yet, holds nothing.
async function readHeld(deps: ShipDeps, repo: string, sha: string, head: string): Promise<boolean | 'cap'> {
  try {
    return await deps.contains(repo, sha, head);
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
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

// Makes the reads pickRefShipment asks for, one at a time, until it decides.
async function readRefShipment(deps: ShipDeps, state: PrState, sha: string, source: Extract<Source, { kind: 'ref' }>): Promise<Shipment | null | 'cap'> {
  const gated = source.gated;
  const facts: RefFacts = { found: await readReleaseShipment(deps, state, sha), gatedRef: gated?.ref ?? null };
  for (;;) {
    const step = pickRefShipment(facts);
    if (step.kind === 'done') {
      return step.result;
    }
    if (gated === undefined) {
      throw new Error('a ref source with no gate asked for a gated read');
    }
    await match(step)
      .with({ kind: 'read-gate' }, async () => {
        facts.gate = await deps.readGate(state.repo, gated.gate);
      })
      .with({ kind: 'read-files' }, async () => {
        facts.files = await readChangedFiles(deps.run, state.repo, getPRNumber(state.ref));
      })
      .with({ kind: 'read-held' }, async () => {
        facts.held = await readHeld(deps, state.repo, sha, gated.ref);
      })
      .exhaustive();
  }
}
