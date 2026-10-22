import { z } from 'zod';

export const COMPARED_ROWS = z.record(z.string(), z.boolean());
