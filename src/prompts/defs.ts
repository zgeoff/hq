import { config } from '../config/config.ts';
import { DEFS_SOURCES } from './defs-sources.ts';
import { defsSource } from './defs-source.ts';

// oxlint-disable-next-line zgeoff/no-top-level-arrow -- every caller reads DEFS(); GEO-1318 holds this lint debt
export const DEFS = () => config().HQ_DEFINITIONS_DIR ?? DEFS_SOURCES[defsSource()].dir();
