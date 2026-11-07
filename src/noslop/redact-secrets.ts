import type { NoslopSecrets } from './load-noslop-secrets.ts';

const MIN_SECRET_CHARS = 4;

export function redactSecrets(text: string, secrets: NoslopSecrets): string {
  let out = text;
  for (const value of [secrets.appID, secrets.installationID, secrets.privateKey]) {
    if (value.length >= MIN_SECRET_CHARS) {
      out = out.replaceAll(value, '[redacted]');
    }
  }
  return out;
}
