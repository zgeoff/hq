import { z } from 'zod';
import { parseJSON } from '../noslop/parse-json.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';

const BaseSchema = z.object({ baseRefName: z.string().min(1) });

// The branch the PR merges into as GitHub says now, or null when gh fails, runs past CALL_MS or gives
// no base.
export async function readPRBase(run: Runner, slug: string, pr: number): Promise<string | null> {
  try {
    const result = await boundedRunner(run, CALL_MS)(['gh', 'pr', 'view', String(pr), '-R', slug, '--json', 'baseRefName']);
    const parsed = result.code === 0 ? BaseSchema.safeParse(parseJSON(result.stdout)) : null;
    return parsed?.success === true ? parsed.data.baseRefName : null;
  } catch {
    return null;
  }
}
