import { z } from 'zod';

export const reportIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  status: z.string(),
  statusType: z.string(),
  project: z.string().nullable(),
  priority: z.number(),
  labels: z.array(z.string()),
});
