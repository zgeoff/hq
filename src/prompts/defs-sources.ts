import { getHome } from '../fleet/get-home.ts';

export const DEFS_SOURCES = {
  hq: { dir: () => `${getHome()}/.local/share/atc/workspaces/hq-defs`, repo: 'zgeoff/hq' },
} as const;
export type DefsSource = keyof typeof DEFS_SOURCES;
