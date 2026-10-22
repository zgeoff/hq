import { getHome } from '../fleet/get-home.ts';

// GEO-1019: the definitions checkout comes from one setting. HQ_DEFINITIONS_DIR (env) names it
// outright; else the switch file (defsSourceFile) picks a source, whose checkout sits under the
// workspaces root. The fleet's cwd, the lanes' capacity script and the start prompts all read DEFS().
export const DEFS_SOURCES = {
  hq: { dir: () => `${getHome()}/.local/share/atc/workspaces/hq-defs`, repo: 'zgeoff/hq' },
} as const;
export type DefsSource = keyof typeof DEFS_SOURCES;
