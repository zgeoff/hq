import { mainPrompt } from './main-prompt.ts';

// oxlint-disable-next-line zgeoff/no-top-level-arrow -- named as its callers use it
export const rolePrompt = (skill: string) => mainPrompt(`skills/${skill}/references/session-prompt.md`);
