import { getCacheDir } from './get-cache-dir.ts';

// the old single file: the account that read last
export function getUsageCache(): string {
  return `${getCacheDir()}/claude-usage.json`;
}
