import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { isInScope } from '../scope/is-in-scope.ts';
import { readGhJSON } from './read-gh-json.ts';
import { NAME } from './name.ts';

const RepoSchema = z.object({ name: z.string(), isArchived: z.literal(false) });

export async function loadRepos(run: Runner, env?: RunOpts['env']): Promise<string[]> {
  const raw = await readGhJSON(run, ['repo', 'list', 'zgeoff', '--limit', '500', '--json', 'name,isArchived'], env, 'gh repo list');
  if (!Array.isArray(raw)) throw new HqError('command_failed', 'gh repo list did not return a list');
  return raw.flatMap((entry) => {
    const repo = RepoSchema.safeParse(entry);
    return repo.success && NAME.test(repo.data.name) && !/^\.+$/u.test(repo.data.name) && isInScope(repo.data.name) ? [repo.data.name] : [];
  });
}
