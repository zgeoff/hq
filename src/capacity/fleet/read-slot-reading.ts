import { redact } from '../../redact/redact.ts';
import type { Runner } from '../../runner/types.ts';
import { parseSlotHeaders } from './parse-slot-headers.ts';
import { readSlotCredential } from './read-slot-credential.ts';
import type { SlotReading } from './types.ts';

export interface SlotReadResult {
  reading: SlotReading;

  // Why no answer came, with the token redacted; null when the slot answered.
  problem: string | null;
}

const REQUEST_MS = 15_000;
const BODY = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });

// One 1-token haiku request: /v1/messages answers a setup token with its account's rate-limit headers.
// The token lives in this call only.
export async function readSlotReading(run: Runner, opToken: string, slot: number): Promise<SlotReadResult> {
  const empty = { slot, five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null };
  const credential = await readSlotCredential(run, opToken, slot);
  if (credential === null) {
    return { reading: { ...empty, status: 'op-failed' }, problem: `slot ${slot}: op read gave no token` };
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20', 'content-type': 'application/json' },
      body: BODY,
      signal: AbortSignal.timeout(REQUEST_MS),
    });
    await response.body?.cancel();
    return { reading: { ...empty, ...parseSlotHeaders(response.headers), status: String(response.status) }, problem: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reading: { ...empty, status: 'request-failed' }, problem: `slot ${slot}: ${redact(message.replaceAll(credential, '[redacted]').replaceAll(opToken, '[redacted]'))}` };
  }
}
