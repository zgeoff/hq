import { buildRowSchema } from '../db/build-row-schema.ts';
import { DesignPassSchema } from './design-pass-schema.ts';

export const RunSessionSchema = buildRowSchema('run_sessions').extend({ design_pass: DesignPassSchema });
