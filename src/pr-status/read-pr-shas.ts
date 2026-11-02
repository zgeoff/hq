import { z } from 'zod';
import { parseJSON } from '../noslop/parse-json.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';

export interface PRShas {
  head: string;
  base: string;
}

const ShasSchema = z.object({ headRefOid: z.string().min(1), baseRefOid: z.string().min(1) });

export async function readPRShas(run: Runner, slug: string, pr: number): Promise<PRShas | null> {
  try {
    const result = await boundedRunner(run, CALL_MS)(['gh', 'pr', 'view', String(pr), '-R', slug, '--json', 'headRefOid,baseRefOid']);
    const parsed = result.code === 0 ? ShasSchema.safeParse(parseJSON(result.stdout)) : null;
    return parsed?.success === true ? { head: parsed.data.headRefOid, base: parsed.data.baseRefOid } : null;
  } catch {
    return null;
  }
}
