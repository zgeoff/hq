import type { Runner } from '../../runner/types.ts';
import { parseSlotHeaders } from './parse-slot-headers.ts';
import { readSlotCredential } from './read-slot-credential.ts';
import { redactSlotSecrets } from './redact-slot-secrets.ts';
import type { SlotReading } from './types.ts';

export interface SlotReadResult {
  reading: SlotReading;
  problem: string | null;
}

const REQUEST_MS = 15_000;
const BODY = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });

// One 1-token haiku request: /v1/messages answers a setup token with its account's rate-limit headers.
export async function readSlotReading(run: Runner, opToken: string, slot: number, signal: AbortSignal): Promise<SlotReadResult> {
  const empty = { slot, five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null };
  const read = await readSlotCredential(run, opToken, slot, signal);
  signal.throwIfAborted();
  if (read.kind === 'failed') {
    return { reading: { ...empty, status: 'op-failed' }, problem: `slot ${slot}: ${read.reason}` };
  }
  const credential = read.credential;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20', 'content-type': 'application/json' },
      body: BODY,
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_MS)]),
    });
    await response.body?.cancel();
    return { reading: { ...empty, ...parseSlotHeaders(response.headers), status: String(response.status) }, problem: null };
  } catch (error) {
    signal.throwIfAborted();
    const message = error instanceof Error ? error.message : String(error);
    return { reading: { ...empty, status: 'request-failed' }, problem: `slot ${slot}: ${redactSlotSecrets(message, [credential, opToken])}` };
  }
}
