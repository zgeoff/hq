import type { DefsSource } from './defs-sources.ts';
import { DEFS_SOURCES } from './defs-sources.ts';

export const isDefsSource = (v: string): v is DefsSource => Object.hasOwn(DEFS_SOURCES, v);
