import type { ThroughputLine } from './types.ts';

// A line before hq has read Linear's filed and In Progress issues: no count, so no colour.
export function buildUnreadLine(name: string, target: string): ThroughputLine {
  return { name, detail: 'Linear not read yet', target, verdict: 'none', alerts: [] };
}
