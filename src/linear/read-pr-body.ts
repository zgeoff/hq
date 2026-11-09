import { z } from 'zod';
import { cleanEnv } from '../runner/clean-env.ts';
import type { Runner } from '../runner/types.ts';
import type { PRLink } from './read-pointed-pr.ts';

const CALL_MS = 30_000;
const bodySchema = z.object({ body: z.string() });

export type PRBodyRead = { ok: true; body: string } | { ok: false; reason: string };

export async function readPRBody(run: Runner, link: PRLink): Promise<PRBodyRead> {
  const result = await run(['gh', 'pr', 'view', link.number, '-R', `${link.owner}/${link.repo}`, '--json', 'body'], { env: cleanEnv(), timeoutMs: CALL_MS });
  if (result.code !== 0) {
    return { ok: false, reason: result.stderr.trim().split('\n')[0] ?? '' };
  }
  try {
    const parsed = bodySchema.safeParse(JSON.parse(result.stdout));
    return parsed.success ? { ok: true, body: parsed.data.body } : { ok: false, reason: 'gh gave no body field' };
  } catch {
    return { ok: false, reason: 'gh gave output that is not JSON' };
  }
}
