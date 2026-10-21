import type { NoslopSecrets } from './load-noslop-secrets.ts';

const TAIL_CHARS = 300;

export function getTail(text: string, secrets: NoslopSecrets): string {
  return sanitizeSecrets(text, secrets).trim().slice(-TAIL_CHARS);
}

function sanitizeSecrets(text: string, secrets: NoslopSecrets): string {
  let out = text;
  for (const value of [secrets.appID, secrets.installationID, secrets.privateKey]) {
    if (value.length >= 4) {
      out = out.replaceAll(value, '[redacted]');
    }
  }
  return out;
}
