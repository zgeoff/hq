import { dirname } from 'node:path';
import { config } from '../config/config.ts';
import { DEFS_SOURCES } from './defs-sources.ts';

export const PRIVATE_TREE = {
  dir: () => config().HQ_PRIVATE_DIR ?? `${dirname(DEFS_SOURCES.hq.dir())}/hq-private`,
  repo: 'zgeoff/hq-private',
} as const;
