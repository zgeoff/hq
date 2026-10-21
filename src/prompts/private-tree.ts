import { dirname } from 'node:path';
import { config } from '../config/config.ts';
import { DEFS_SOURCES } from './defs-sources.ts';

// The start prompts and grants live in zgeoff/hq-private. Its checkout is a second tree beside
// hq-defs, never a source `hq defs use` can pick. HQ_PRIVATE_DIR names it outright (tests).
export const PRIVATE_TREE = {
  dir: () => config().HQ_PRIVATE_DIR ?? `${dirname(DEFS_SOURCES.hq.dir())}/hq-private`,
  repo: 'zgeoff/hq-private',
} as const;
