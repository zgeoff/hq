import { onTestFinished } from 'bun:test';
import { overrideEnv } from '../src/config/override-env.ts';
import { resetFetchCache } from '../src/prompts/reset-fetch-cache.ts';
import { createTreeCheckout } from './create-tree-checkout.ts';
import { freshDb } from './helpers.ts';
import { readPrivateFixture } from './read-private-fixture.ts';

export const INTAKE = 'skills/intake/references/session-prompt.md';

function createHomeOverride(home: string): () => void {
  const saved = process.env['HOME'];
  process.env['HOME'] = home;
  return () => {
    if (saved === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = saved;
    }
  };
}

export function buildPrompt(who: string): string {
  return `# session prompt\n\n\`\`\`text\nYou are an invented ${who}.\n\`\`\`\n`;
}

// A test home with no checkout in it. Each tree is made on demand, cloned from a local origin.
export function createTreeFixture() {
  const base = freshDb(),
    laneFiles = { 'skills/delivery-lead/scripts/capacity.sh': '#!/bin/sh\n', 'skills/delivery-lead/pacing.json': '{}\n' };
  onTestFinished(base.cleanup);
  onTestFinished(createHomeOverride(base.dir));
  onTestFinished(overrideEnv('HQ_PRIVATE_DIR', `${base.dir}/.local/share/atc/workspaces/hq-private`));
  onTestFinished(overrideEnv('HQ_DEFINITIONS_DIR', undefined));
  onTestFinished(resetFetchCache);
  resetFetchCache();
  return {
    db: base.db,
    dir: base.dir,
    createHq: (files: Record<string, string> = {}) => createTreeCheckout(base.dir, 'hq', { ...laneFiles, ...files }),
    createPrivate: (files: Record<string, string> = {}) => createTreeCheckout(base.dir, 'private', { [INTAKE]: buildPrompt('intake'), ...files }),
    createBoth: (privateFiles: Record<string, string> = {}) => {
      const fixture = readPrivateFixture();
      return {
        hq: createTreeCheckout(base.dir, 'hq', { ...laneFiles, ...fixture.hqFiles }),
        private: createTreeCheckout(base.dir, 'private', { ...fixture.privateFiles, ...privateFiles }),
      };
    },
  };
}
