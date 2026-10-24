import { createHash } from 'node:crypto';

// The name of a template directory: a change to restic or to any input of the build names a new
// directory, so a stale template is never reused.
export function buildResticTemplateKey(resticVersion: string, inputs: string[]): string {
  return createHash('sha256').update(JSON.stringify([resticVersion, ...inputs])).digest('hex').slice(0, 16);
}
