import { z } from 'zod';

const TOP_ISSUE = z.object({ identifier: z.string(), title: z.string() });

export const PROMOTABLE_TOP = z.object({ at: z.string(), focus: z.string(), issues: z.array(TOP_ISSUE) }).nullable();
export const PROMOTABLE_TOP_KEY = 'lanes_promotable_top';
export const PROMOTABLE_TOP_SIZE = 5;
