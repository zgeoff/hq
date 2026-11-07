import { z } from 'zod';

export const BindingsSchema = z.array(z.union([z.string(), z.number(), z.null()]));
