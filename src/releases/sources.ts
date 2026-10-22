import type { Source } from './types.ts';

// The only repos hq knows releases for. Anything else (dotfiles, evals) has none.
export const SOURCES: Record<string, Source> = {
  nixie: { kind: 'releases', tag: /^v\d/ },
  impz: { kind: 'releases', tag: /^v\d/ },
  'auto-mode': { kind: 'releases', tag: /^auto-mode-v\d/ },
  atc: { kind: 'releases', tag: /^@zgeoff\/atc@\d/ },
  // A moving tag: its commit time is not a release time, so a PR ships "now", when first seen contained.
  cloud: { kind: 'ref', ref: 'deployed/prod' },

  // Release-please monorepos: a PR ships once each package it changes has a published release holding it.
  tools: { kind: 'packages' },
  noslop: { kind: 'packages' },

  // hq runs from the installed binary, so a PR ships once the installed build holds its merge.
  hq: { kind: 'build' },

  // A vers merge deploys.
  vers: { kind: 'merge' },
};
