import { z } from 'zod';
import { buildJSONColumn } from '../db/build-json-column.ts';
import type { StoredFinding } from './types.ts';

const StoredFindingSchema = z.object({
  id: z.string(),
  lens: z.string(),
  severity: z.string(),
  title: z.string(),
  criterion: z.string().nullish(),
  rule: z.string().nullish(),
  path: z.string().nullish(),
  startLine: z.number().nullish(),
  endLine: z.number().nullish(),
  writtenByChange: z.boolean().nullish(),
  late: z.boolean().nullish(),
}) satisfies z.ZodType<StoredFinding>;

// The findings column of a noslop round.
export const StoredFindingsColumn = buildJSONColumn(z.array(StoredFindingSchema));
