import { z } from 'zod';

const MARK = '"compact_boundary"';
const boundarySchema = z.looseObject({ type: z.literal('system'), subtype: z.literal('compact_boundary') });

// Whether one Claude Code transcript line is a compaction: a system entry of subtype compact_boundary.
// A line that is not JSON is not one.
export function isCompactionBoundary(line: string): boolean {
  if (!line.includes(MARK)) {
    return false;
  }
  try {
    return boundarySchema.safeParse(JSON.parse(line)).success;
  } catch {
    return false;
  }
}
