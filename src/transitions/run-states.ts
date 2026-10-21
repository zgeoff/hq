export const RUN_STATES = ['working', 'blocked', 'merged', 'deploying', 'deploy-held', 'live-check', 'done', 'dropped'] as const;
export type RunState = (typeof RUN_STATES)[number];
