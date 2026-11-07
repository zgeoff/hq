import { buildRowSchema } from '../db/build-row-schema.ts';
import { DesignPassSchema } from './design-pass-schema.ts';

export const RunPRSchema = buildRowSchema('run_prs').extend({ design_pass: DesignPassSchema });
