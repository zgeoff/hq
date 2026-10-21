import type { GoalKey } from './goal-keys.ts';

export const GOAL_NAMES: Record<GoalKey, string> = {
  bugs: 'Bug share',
  features: 'Feature + Improvement share',
  deploys: 'deploy-prod success',
  downtime: 'Nix downtime',
  ciwaste: 'CI minutes wasted',
  mustfix: 'First review must-fix',
  cost: 'Cost',
};
