import { z } from 'zod';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { DESIGN_LANES } from '../lanes/design-lane.ts';

export const RunSchema = buildRowSchema('runs').extend({ design_lane: z.enum(DESIGN_LANES).nullable() });
