export const ASK_STATES = ['queued', 'open', 'answered', 'applied', 'later', 'skipped', 'closed'] as const;
export type AskState = (typeof ASK_STATES)[number];
