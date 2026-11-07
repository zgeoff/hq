import { z } from 'zod';
import { buildJSONColumn } from '../db/build-json-column.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';

const IssuesSchema = buildJSONColumn(z.array(z.string()));

export const AskRowSchema = buildRowSchema('asks').extend({ issues: IssuesSchema });
