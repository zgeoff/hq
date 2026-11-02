import { z } from 'zod';

// The first few focus-matching promotable Backlog issues, stored beside the promotable count with the same `at` and focus key.
export const PROMOTABLE_TOP = z.object({ at: z.string(), focus: z.string(), issues: z.array(z.object({ identifier: z.string(), title: z.string() })) }).nullable();
export const PROMOTABLE_TOP_KEY = 'lanes_promotable_top';
export const PROMOTABLE_TOP_SIZE = 5;
