import { config } from '../config/config.ts';

export function backupDir(): string {
  return config().HQ_REPAIR_BACKUPS ?? `${process.env['HOME']}/.local/share/z-sessions/backups/transcripts`;
}
