import { z } from 'zod';

export const projectIssuesSchema = z.array(z.object({ id: z.string(), statusType: z.string(), project: z.string().nullable() }));
