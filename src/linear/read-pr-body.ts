import { z } from 'zod';
import { cleanEnv } from '../runner/clean-env.ts';
import type { Runner } from '../runner/types.ts';

const CALL_MS = 30_000;
const bodySchema = z.object({ body: z.string() });

export async function readPRBody(run: Runner, ref: string): Promise<string | null> {
  const [repo = '', number = ''] = ref.split('#');
  const result = await run(['gh', 'pr', 'view', number, '-R', `zgeoff/${repo}`, '--json', 'body'], { env: cleanEnv(), timeoutMs: CALL_MS });
  if (result.code !== 0) {
    return null;
  }
  try {
    const parsed = bodySchema.safeParse(JSON.parse(result.stdout));
    return parsed.success ? parsed.data.body : null;
  } catch {
    return null;
  }
}
