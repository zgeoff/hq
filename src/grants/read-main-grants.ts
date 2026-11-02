import { z } from 'zod';
import { HqError } from '../errors.ts';
import { runPrivateGit } from './run-private-git.ts';

export interface MainGrant {
  session: string;
  id: string;
  label: string;
  name: string;
}

export function readMainGrants(directory: string): MainGrant[] {
  const files = runPrivateGit(directory, ['ls-tree', '--name-only', 'origin/main', 'grants/'])
    .split('\n')
    .filter((path) => /^grants\/[^/]+\.yaml$/u.test(path));
  return files.flatMap((path) => parseGrantsFile(path, runPrivateGit(directory, ['show', `origin/main:${path}`])));
}

const GrantsFileSchema = z.array(z.object({ id: z.string(), label: z.string() }));

function parseGrantsFile(path: string, text: string): MainGrant[] {
  const session = path.slice('grants/'.length, -'.yaml'.length);
  const entries = parseGrantEntries(text);
  if (entries === null) {
    throw new HqError('bad_grants', `${path} at hq-private main is not a list of grants with an id and a label`);
  }
  return entries.map((grant) => ({ session, id: grant.id, label: grant.label, name: `${session}-${grant.id}` }));
}

export function parseGrantEntries(text: string): z.infer<typeof GrantsFileSchema> | null {
  try {
    const parsed = GrantsFileSchema.safeParse(Bun.YAML.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
