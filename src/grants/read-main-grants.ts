import { z } from 'zod';
import { HqError } from '../errors.ts';
import { runPrivateGit } from './run-private-git.ts';

// One grant as hq-private's main lists it in grants/<session>.yaml, and the name hq marks it by.
export interface MainGrant {
  session: string;
  id: string;
  label: string;
  name: string;
}

// Every grant in grants/ at hq-private's origin/main, as the local clone last fetched it. Never the
// working tree.
export function readMainGrants(directory: string): MainGrant[] {
  const files = runPrivateGit(directory, ['ls-tree', '--name-only', 'origin/main', 'grants/'])
    .split('\n')
    .filter((path) => /^grants\/[^/]+\.yaml$/u.test(path));
  return files.flatMap((path) => parseGrantsFile(path, runPrivateGit(directory, ['show', `origin/main:${path}`])));
}

const GrantsFileSchema = z.array(z.object({ id: z.string(), label: z.string() }));

function parseGrantsFile(path: string, text: string): MainGrant[] {
  const session = path.slice('grants/'.length, -'.yaml'.length);
  const parsed = GrantsFileSchema.safeParse(parseYAML(path, text));
  if (!parsed.success) {
    throw new HqError('bad_grants', `${path} at hq-private main is not a list of grants with an id and a label`);
  }
  return parsed.data.map((grant) => ({ session, id: grant.id, label: grant.label, name: `${session}-${grant.id}` }));
}

function parseYAML(path: string, text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch {
    throw new HqError('bad_grants', `${path} at hq-private main is not YAML`);
  }
}
