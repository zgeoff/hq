import { redact } from '../../redact/redact.ts';

export function redactSlotSecrets(message: string, secrets: readonly string[]): string {
  return redact(secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), message));
}
