import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LaneRules } from './types.ts';

const names = z.array(z.string().min(1)).default([]);

const laneSchema = z.strictObject({ issues: names, projects: names, labels: names, childrenOf: names, fallback: z.boolean().default(false) });

const excludeSchema = z.strictObject({ projects: names, labels: names, reason: z.string().min(1) });

const rulesSchema = z.strictObject({ team: z.string().min(1), readyState: z.string().min(1), exclude: z.array(excludeSchema), lanes: z.record(z.string(), laneSchema) });

// lanes.json checked against pacing.json's lane names: every lane it names exists there, each lane
// matches something, every pacing.json lane has rules, and exactly one lane is the fallback.
// pacingLanes null: pacing.json gives only slot caps, so the rules stand on their own.
export function validateLaneRules(raw: unknown, pacingLanes: string[] | null): LaneRules {
  const parsed = rulesSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues.at(0);
    throw new HqError('bad_lanes', `lanes.json: ${issue?.path.join('.') || 'the top'}: ${issue?.message ?? 'unreadable'}`);
  }
  const rules = parsed.data;
  for (const [name, lane] of Object.entries(rules.lanes)) {
    if (pacingLanes !== null && !pacingLanes.includes(name)) {
      throw new HqError('bad_lanes', `lanes.json: lane ${name} is not in pacing.json (${pacingLanes.join(', ')})`);
    }
    const matches = lane.issues.length + lane.projects.length + lane.labels.length + lane.childrenOf.length;
    if (lane.fallback && matches > 0) {
      throw new HqError('bad_lanes', `lanes.json: fallback lane ${name} takes nothing else`);
    }
    if (!lane.fallback && matches === 0) {
      throw new HqError('bad_lanes', `lanes.json: lane ${name} matches nothing`);
    }
  }
  for (const name of pacingLanes ?? []) {
    if (!(name in rules.lanes)) {
      throw new HqError('bad_lanes', `lanes.json: pacing.json lane ${name} has no rules`);
    }
  }
  const fallbacks = Object.entries(rules.lanes).filter(([, lane]) => lane.fallback);
  if (fallbacks.length !== 1) {
    throw new HqError('bad_lanes', `lanes.json: exactly one lane must be the fallback (found ${fallbacks.length})`);
  }
  for (const [index, rule] of rules.exclude.entries()) {
    if (rule.projects.length + rule.labels.length === 0) {
      throw new HqError('bad_lanes', `lanes.json: exclude.${index} names no project or label`);
    }
  }
  return rules;
}
