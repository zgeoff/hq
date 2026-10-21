import { z } from 'zod';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';

const HEAD_ANSWER = z.object({ headRefOid: z.string().min(1) });

// The PR's head commit as GitHub says now, or null when gh fails, runs past CALL_MS or gives no head.
export async function readPRHead(run: Runner, slug: string, pr: number): Promise<string | null> {
  try {
    const result = await boundedRunner(run, CALL_MS)(['gh', 'pr', 'view', String(pr), '-R', slug, '--json', 'headRefOid']);
    return result.code === 0 ? parseHead(result.stdout) : null;
  } catch {
    return null;
  }
}

function parseHead(stdout: string): string | null {
  try {
    const parsed = HEAD_ANSWER.safeParse(JSON.parse(stdout));
    return parsed.success ? parsed.data.headRefOid : null;
  } catch {
    return null;
  }
}
