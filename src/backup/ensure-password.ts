import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { backupPaths } from './backup-paths.ts';

// The restic password: made once, 0600. It must also live off this PC, or a lost PC loses the backups.
export function ensurePassword(): { path: string; created: boolean } {
  const path = backupPaths().password;
  if (existsSync(path)) {
    if (statSync(path).mode & 0o077) chmodSync(path, 0o600); // the key is for this user only
    return { path, created: false };
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { path, created: true };
}
