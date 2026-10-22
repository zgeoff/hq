import { z } from 'zod';
import { ISSUE_TYPES } from '../linear/issue-types.ts';

const readyIssueSchema = z.object({
  identifier: z.string(),
  project: z.string().nullable(),
  projectLabels: z.array(z.string()),
  labels: z.array(z.string()),
  type: z.enum([...ISSUE_TYPES, 'none']),
  priority: z.number(),
  createdAt: z.string(),
  parent: z.string().nullable(),
});

// The last Ready read from Linear: the issues the lanes may take, and the Design issues only the
// design slot takes. lanes.json's other exclusions are left out of both.
export const READY_SNAPSHOT = z.object({ at: z.string(), eligible: z.array(readyIssueSchema), design: z.array(readyIssueSchema) }).nullable();

export type ReadySnapshot = NonNullable<z.output<typeof READY_SNAPSHOT>>;
