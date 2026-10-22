import { chmodSync, writeFileSync } from 'node:fs';
import { HqError } from '../errors.ts';
import { readPrompt } from '../prompts/read-prompt.ts';
import { rolePrompt } from '../prompts/role-prompt.ts';
import { repoLoopPromptPath } from './repo-loop-prompt-path.ts';

// The orchestrator's loop text: its start prompt as it stands on origin/main, less the leading
// "/loop ". If that read fails, hq points to no file at all (a hand-kept or working-tree copy
// isn't what the owner approved): the wake tells the session to re-arm from its own start prompt.
export function resolveLoopPrompt(opts: { write: boolean }): { path: string | null; source: 'main' | 'none'; error: string | null } {
  try {
    const prompt = readPrompt(rolePrompt('delivery-lead'));
    if (!prompt.startsWith('/loop ')) throw new HqError('bad_prompt', 'the delivery-lead start prompt does not begin with "/loop "');
    const text = prompt.slice('/loop '.length).trim();
    if (!text) throw new HqError('bad_prompt', 'the delivery-lead loop text is empty');
    const path = repoLoopPromptPath();
    if (opts.write) {
      writeFileSync(path, `${text}\n`, { mode: 0o600 });
      chmodSync(path, 0o600);
    }
    return { path, source: 'main', error: null };
  } catch (e) {
    return { path: null, source: 'none', error: String((e as Error).message ?? e) };
  }
}
