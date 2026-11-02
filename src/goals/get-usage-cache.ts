import { getCacheDir } from './get-cache-dir.ts';

export function getUsageCache(): string {
  return `${getCacheDir()}/claude-usage.json`;
}
