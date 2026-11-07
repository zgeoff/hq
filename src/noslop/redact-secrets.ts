import type { NoslopSecrets } from './load-noslop-secrets.ts';

export function redactSecrets(text: string, secrets: NoslopSecrets): string {
  let out = text;
  for (const value of collectSecretForms(secrets)) {
    out = out.replaceAll(value, '[redacted]');
  }
  return out;
}

const MIN_SECRET_CHARS = 4;
const MIN_KEY_LINE_CHARS = 16;

// A child may print the key JSON-escaped, one line of it, or cut short, so each form is redacted.
// Longest first, so a short secret inside a longer one cannot split it before its own match.
function collectSecretForms(secrets: NoslopSecrets): string[] {
  const keyLines = secrets.privateKey.split('\n').filter((line) => line.trim().length >= MIN_KEY_LINE_CHARS);
  const forms = [secrets.appID, secrets.installationID, secrets.privateKey, JSON.stringify(secrets.privateKey).slice(1, -1), ...keyLines].filter((form) => form.length >= MIN_SECRET_CHARS);
  return [...new Set(forms)].toSorted((left, right) => right.length - left.length);
}
