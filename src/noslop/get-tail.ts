import type { NoslopSecrets } from './load-noslop-secrets.ts';
import { redactSecrets } from './redact-secrets.ts';

const TAIL_CHARS = 300;

export function getTail(text: string, secrets: NoslopSecrets): string {
  return redactSecrets(text, secrets).trim().slice(-TAIL_CHARS);
}
