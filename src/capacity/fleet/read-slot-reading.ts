import { parseSlotHeaders } from './parse-slot-headers.ts';
import { readSlotCredential } from './read-slot-credential.ts';
import { redactSlotSecrets } from './redact-slot-secrets.ts';
import type { FleetIO, SlotReading } from './types.ts';

export interface SlotReadResult {
  reading: SlotReading;
  problem: string | null;
}

const REQUEST_MS = 15_000;
const BODY = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });

// One 1-token haiku request: /v1/messages answers a setup token with its account's rate-limit headers.
export async function readSlotReading(io: Pick<FleetIO, 'run' | 'httpClient'>, opToken: string, slot: number, signal: AbortSignal): Promise<SlotReadResult> {
  const empty = { slot, five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null };
  const read = await readSlotCredential(io.run, opToken, slot, signal);
  signal.throwIfAborted();
  if (read.kind === 'failed') {
    return { reading: { ...empty, status: 'op-failed' }, problem: `slot ${slot}: ${read.reason}` };
  }
  const credential = read.credential;
  try {
    const response = await io.httpClient('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20', 'content-type': 'application/json' },
      body: BODY,
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_MS)]),
    });
    await response.body?.cancel();
    const figures = parseSlotHeaders(response.headers);
    return { reading: { ...empty, ...figures, status: String(response.status) }, problem: pickAnswerProblem(slot, response, Object.values(figures).some((figure) => figure !== null)) };
  } catch (error) {
    signal.throwIfAborted();
    const message = error instanceof Error ? error.message : String(error);
    return { reading: { ...empty, status: 'request-failed' }, problem: `slot ${slot}: ${redactSlotSecrets(message, [credential, opToken])}` };
  }
}

function pickAnswerProblem(slot: number, response: Response, hasUsage: boolean): string | null {
  const failed = response.status >= 500 || (!response.ok && !hasUsage);
  return failed ? `slot ${slot}: the messages API answered ${response.status}` : null;
}
