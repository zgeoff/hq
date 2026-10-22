import { mainPrompt } from './main-prompt.ts';

// oxlint-disable-next-line zgeoff/function-verb, zgeoff/no-top-level-arrow -- named as its callers use it; GEO-1318 holds this lint debt
export const rolePrompt = (skill: string) => mainPrompt(`skills/${skill}/references/session-prompt.md`);
