import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { backupPaths } from './backup-paths.ts';

// The file is created exclusively, so a second first run keeps the password the first one wrote.
export function ensurePassword(): { path: string; created: boolean } {
  const path = backupPaths().password;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, `${randomBytes(32).toString('base64url')}\n`, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
      throw error;
    }
    if (statSync(path).mode & 0o077) {
      chmodSync(path, 0o600);
    }
    return { path, created: false };
  }
  chmodSync(path, 0o600);
  return { path, created: true };
}
