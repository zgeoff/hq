import { z } from 'zod';

export const strMap = z.record(z.string(), z.string());
