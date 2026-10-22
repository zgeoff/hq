import { goalLine } from './goal-line.ts';
import type { GoalRow } from './types.ts';

export function goalsText(g: { weeks: GoalRow[]; days: GoalRow[] }, withDays: boolean): string[] {
  return [
    'Team goals (set by the owner: fewer wasted deploys and builds; bug share is under Bug share by week). Sydney days and weeks.',
    '  deploy-prod: cloud runs by what they did. The rate counts applies only; holds and no-apply runs are shown apart. CI min: wall clock per run, not billable. log: z-delivery DEPLOY/HOLD words.',
    ...g.weeks.map(goalLine),
    ...(withDays ? ['  by day:', ...g.days.map(goalLine)] : []),
  ];
}
