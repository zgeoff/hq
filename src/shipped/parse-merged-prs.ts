import { HqError } from '../errors.ts';
import { mergedPRsOutputSchema } from './merged-prs-output-schema.ts';
import type { MergedPRsOutput } from './merged-prs-output-schema.ts';

// merged-prs.sh's output, checked against its schema; a change to it fails here, naming the fields.
export function parseMergedPRs(json: string): MergedPRsOutput {
  const checked = mergedPRsOutputSchema.safeParse(JSON.parse(json));
  if (!checked.success) {
    throw new HqError('shipped_failed', `merged-prs.sh printed an unexpected shape: ${checked.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return checked.data;
}
