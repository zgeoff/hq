import { z } from 'zod';

export const DesignPassSchema = z.union([z.literal(0), z.literal(1)]);
