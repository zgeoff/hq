export const GOAL_KEYS = ['bugs', 'features', 'deploys', 'downtime', 'ciwaste', 'mustfix', 'cost'] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];
