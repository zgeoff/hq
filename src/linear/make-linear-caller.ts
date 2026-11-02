import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { readLocalSetting } from '../config/read-local-setting.ts';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { KEY_CACHE } from './key-cache.ts';
import { redact } from './redact.ts';
import type { LinearCall } from './types.ts';

const LinearAnswer = z.object({ data: z.unknown().optional(), errors: z.array(z.unknown()).optional() });

export function makeLinearCaller(run: Runner, doFetch: typeof fetch = fetch, recordRead: () => void = () => {}): LinearCall {
  return async (query, variables) => {
    // Bun's fetch trace prints request headers, the key among them, to stderr.
    if (process.env['BUN_CONFIG_VERBOSE_FETCH']) {
      throw new HqError('linear_failed', 'BUN_CONFIG_VERBOSE_FETCH is set; hq will not send the Linear key while fetch is traced');
    }
    const API = 'https://api.linear.app/graphql';
    const key = await readKey(run, recordRead);
    let res: Response;
    try {
      res = await doFetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: key }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HqError('linear_failed', `Linear request failed: ${redact(message, key).slice(0, 200)}`);
    }
    const raw = await readJSONBody(res);
    const parsed = LinearAnswer.safeParse(raw);
    const body = parsed.success ? parsed.data : null;
    if (res.status === 401 || res.status === 403) {
      KEY_CACHE.value = null;
    }
    if (!res.ok || !body || body.errors?.length || !body.data || typeof body.data !== 'object') {
      const said = (body?.errors ?? []).map((error) => formatLinearError(error)).join('; ');
      throw new HqError('linear_failed', `Linear answered ${res.status}: ${redact(said, key).slice(0, 200) || 'no data'}`);
    }
    return body.data;
  };
}

async function readJSONBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const LinearError = z.object({ message: z.unknown() });

function formatLinearError(error: unknown): string {
  const parsed = LinearError.safeParse(error);
  if (!parsed.success) {
    return '';
  }
  return String(parsed.data.message ?? '');
}

async function readKey(run: Runner, recordRead: () => void): Promise<string> {
  const ITEM = readLocalSetting('HQ_LINEAR_OP_REF');
  const KEY_TTL_MS = 12 * 3_600_000;
  if (KEY_CACHE.value && KEY_CACHE.ref === ITEM && now().getTime() < KEY_CACHE.expiresAt) {
    return KEY_CACHE.value;
  }
  const env: Record<string, string | undefined> = { ...process.env };
  if (!env['OP_SERVICE_ACCOUNT_TOKEN']) {
    try {
      env['OP_SERVICE_ACCOUNT_TOKEN'] = (JSON.parse(readFileSync(`${process.env['HOME']}/.claude/settings.json`, 'utf8')) as { env?: Record<string, string> }).env?.['OP_SERVICE_ACCOUNT_TOKEN'];
    } catch {}
  }
  if (!env['OP_SERVICE_ACCOUNT_TOKEN']) {
    throw new HqError('no_key', 'no 1Password service-account token (env or ~/.claude/settings.json); op-mint global');
  }
  const r = await run(['op', 'read', ITEM], { env });
  recordRead();
  const v = r.stdout.trim();
  // op's stderr names the failure, never the secret; keep only its first line.
  if (r.code !== 0 || !v) {
    throw new HqError('no_key', `op read ${ITEM} failed (${r.code}): ${redact(r.stderr.trim().split('\n')[0] ?? '', v || null).slice(0, 160)}`);
  }
  KEY_CACHE.value = v;
  KEY_CACHE.ref = ITEM;
  KEY_CACHE.expiresAt = now().getTime() + KEY_TTL_MS;
  return v;
}
