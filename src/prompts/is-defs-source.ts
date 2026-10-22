import type { DefsSource } from './defs-sources.ts';
import { DEFS_SOURCES } from './defs-sources.ts';

// No file: hq, the only source. Anything else is refused, never guessed:
// a session must not start from a checkout nobody chose.
export const isDefsSource = (v: string): v is DefsSource => Object.hasOwn(DEFS_SOURCES, v);
