import { z } from 'zod';
import { buildJSONColumn } from '../db/build-json-column.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';

export const AskRowSchema = buildRowSchema('asks').extend({ issues: buildJSONColumn(z.array(z.string())) });
