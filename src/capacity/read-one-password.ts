import { z } from 'zod';
import { parseJSON } from '../noslop/parse-json.ts';
import { getReadMS as readMs } from './get-read-ms.ts';
import type { RunResult } from '../runner/types.ts';
import type { CapacityProbe, OnePasswordUse } from './types.ts';

// The 1Password account's requests today against its daily limit, from `op service-account
// ratelimit`, which costs no request. Refused when 1Password rate-limits this read or any limit has
// nothing left. Read with the global profile's token, as hq's Linear key is.
export async function readOnePassword(probe: CapacityProbe): Promise<OnePasswordUse> {
  const ran = await runRatelimit(probe);
  if (ran.code !== 0) {
    if (RATE_LIMITED.test(ran.stderr)) {
      return { used: null, limit: null, refused: true };
    }
    throw new Error(`op service-account ratelimit failed (${ran.code}): ${ran.stderr.trim().split('\n')[0]?.slice(0, 160) ?? ''}`);
  }
  return buildUse(Limits.parse(parseJSON(ran.stdout)));
}

const Limits = z.array(z.object({ type: z.string(), used: z.number(), limit: z.number(), remaining: z.number() })),
  RATE_LIMITED = /too many requests|rate.?limit/iu,
  Settings = z.object({ env: z.object({ OP_SERVICE_ACCOUNT_TOKEN: z.string().min(1) }) });

async function runRatelimit(probe: CapacityProbe): Promise<RunResult> {
  const token = await loadServiceAccountToken(probe);
  return await probe.run(['op', 'service-account', 'ratelimit', '--format', 'json'], { env: { OP_SERVICE_ACCOUNT_TOKEN: token }, timeoutMs: readMs(probe) });
}

async function loadServiceAccountToken(probe: CapacityProbe): Promise<string> {
  if (process.env['OP_SERVICE_ACCOUNT_TOKEN']) {
    return process.env['OP_SERVICE_ACCOUNT_TOKEN'];
  }
  const text = await probe.readFile(`${process.env['HOME'] ?? ''}/.claude/settings.json`);
  return parseSettingsToken(text);
}

function parseSettingsToken(text: string): string {
  // parseJSON, not JSON.parse: a parse error quotes the text, and this text holds the token.
  const parsed = Settings.safeParse(parseJSON(text));
  if (!parsed.success) {
    throw new Error('no 1Password service-account token in ~/.claude/settings.json: op-mint global');
  }
  return parsed.data.env.OP_SERVICE_ACCOUNT_TOKEN;
}

function buildUse(rows: z.infer<typeof Limits>): OnePasswordUse {
  const account = rows.find((row) => row.type === 'account');
  return { used: account?.used ?? null, limit: account?.limit ?? null, refused: rows.some((row) => row.remaining <= 0) };
}
