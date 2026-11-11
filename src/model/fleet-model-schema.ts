import { z } from 'zod';

export const FLEET_MODEL_KEY = 'fleet_model';

export const DEFAULT_FLEET_MODEL = 'fable';

export const fleetModelSchema = z.object({ model: z.string(), setAt: z.string(), setBy: z.string() });
