import { z } from 'zod';
import type { PRRef } from '../parse-pr-url.ts';
import type { Runner } from '../runner/types.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import type { ConditionVerdict } from './types.ts';

// GitHub's word for a PR: merged or closed settles it.
export async function readPRVerdict(run: Runner, pr: PRRef): Promise<ConditionVerdict> {
  const name = `${pr.owner}/${pr.repo}#${pr.number}`;
  const result = await run(['gh', 'pr', 'view', String(pr.number), '-R', `${pr.owner}/${pr.repo}`, '--json', 'state'], { env: cleanEnv() });
  if (result.code !== 0) {
    return { kind: 'failed', error: `can't read ${name} (gh exit ${result.code}): ${(result.stderr || result.stdout).trim().slice(0, 200)}` };
  }
  const state = parseState(result.stdout);
  if (state === null) {
    return { kind: 'failed', error: `gh's answer for ${name} has an unexpected shape` };
  }
  if (state === 'MERGED') {
    return { kind: 'settled', what: 'merged' };
  }
  return state === 'CLOSED' ? { kind: 'settled', what: 'closed' } : { kind: 'waiting' };
}

const answerSchema = z.object({ state: z.string() });

function parseState(stdout: string): string | null {
  try {
    const answer = answerSchema.safeParse(JSON.parse(stdout));
    return answer.success ? answer.data.state : null;
  } catch {
    return null;
  }
}
