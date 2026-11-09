export const PR_STATES = ['open', 'merged', 'closed'] as const;
export type PRState = (typeof PR_STATES)[number];
