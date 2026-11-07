import { z } from 'zod';

export function parseIssueFixture<Schema extends z.ZodType>(text: string, schema: Schema): z.output<Schema>[] {
  const listSchema = z.array(schema);
  const parsed = z.union([listSchema, z.object({ issues: listSchema })]).parse(JSON.parse(text));
  return Array.isArray(parsed) ? parsed : parsed.issues;
}
