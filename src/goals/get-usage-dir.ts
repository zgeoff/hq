import { getCacheDir } from './get-cache-dir.ts';

// one <account>.json per live reading, per account
export function getUsageDir(): string {
  return `${getCacheDir()}/claude-usage`;
}
