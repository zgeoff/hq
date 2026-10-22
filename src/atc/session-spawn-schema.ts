import { z } from 'zod';

export const sessionSpawnSchema = z.looseObject({ session: z.looseObject({ id: z.string() }) });
