import { getCacheDir } from './get-cache-dir.ts';

export function getUsageDir(): string {
  return `${getCacheDir()}/claude-usage`;
}
