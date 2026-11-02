import { createHash } from 'node:crypto';

export function buildResticTemplateKey(resticVersion: string, inputs: string[]): string {
  return createHash('sha256').update(JSON.stringify([resticVersion, ...inputs])).digest('hex').slice(0, 16);
}
