// Start prompts as approved on main of hq-private.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { HqError } from '../errors.ts';
import { readPrivateMain } from './read-private-main.ts';

export function readPrompt(source: string, quick = false): string {
  if (source.startsWith('main:')) {
    const rel = source.slice('main:'.length);
    if (!/^[A-Za-z0-9._/-]+$/.test(rel) || rel.split('/').includes('..')) throw new HqError('bad_prompt', `bad prompt path ${rel}`);
    return parsePrompt(readPrivateMain(rel, quick), `origin/main:${rel}`);
  }
  if (!source.startsWith('/')) throw new HqError('bad_prompt', `prompt source ${source} must be main:<path> or an absolute path`);
  if (!existsSync(source)) throw new HqError('no_prompt', `no start prompt at ${source}`);
  // A file path is for a prompt outside every repo. One inside a work tree, directly or through
  // a symlink, would be unmerged text: use main:<path> for it.
  const real = realpathSync(source);
  // Only git's own "not a git repository" clears it; any other answer or error is a refusal.
  const r = Bun.spawnSync(['git', '-C', dirname(real), 'rev-parse', '--is-inside-work-tree'], { env: { ...process.env, LC_ALL: 'C' }, timeout: 10_000 });
  const outside = r.exitCode !== 0 && /not a git repository/.test(r.stderr.toString());
  if (!outside) throw new HqError('bad_prompt', `${source} is inside a git work tree, or git could not tell; use main:<path> so hq reads it from origin/main`);
  return parsePrompt(readFileSync(real, 'utf8'), source);
}

// The start prompt: the one ```text block of a session-prompt.md, else the whole file.
function parsePrompt(text: string, path: string): string {
  const fail = (why: string) => new HqError('bad_prompt', `${path}: ${why}`);
  if (!path.endsWith('session-prompt.md')) {
    if (!text.trim()) throw fail('the prompt is empty');
    return text.trim();
  }
  // Line by line: exactly one ```text fence, closed by a bare ``` with no fence between.
  const lines = text.split('\n');
  const opens = lines.flatMap((l, i) => (l.trimEnd() === '```text' ? [i] : []));
  if (opens.length !== 1) throw fail(`${opens.length} \`\`\`text blocks; expected exactly 1`);
  const start = opens[0]! + 1;
  const close = lines.findIndex((l, i) => i >= start && l.trimStart().startsWith('```'));
  if (close < 0 || lines[close]!.trim() !== '```') throw fail('the ```text block is not closed by a bare ```');
  const prompt = lines.slice(start, close).join('\n').trim();
  if (!prompt) throw fail('the ```text block is empty');
  return prompt;
}
