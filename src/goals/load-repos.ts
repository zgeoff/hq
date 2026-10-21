import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { isInScope } from '../scope/is-in-scope.ts';
import { readGhJSON } from './read-gh-json.ts';
import { NAME } from './name.ts';

export async function loadRepos(run: Runner, env?: RunOpts['env']): Promise<string[]> {
  const raw = await readGhJSON(run, ['repo', 'list', 'zgeoff', '--limit', '500', '--json', 'name,isArchived'], env, 'gh repo list');
  if (!Array.isArray(raw)) throw new HqError('command_failed', 'gh repo list did not return a list');
  return (raw as { name: unknown; isArchived: unknown }[]).filter((r) => r.isArchived === false && typeof r.name === 'string' && NAME.test(r.name) && !/^\.+$/u.test(r.name) && isInScope(r.name)).map((r) => r.name as string);
}
