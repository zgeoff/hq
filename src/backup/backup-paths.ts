import { config } from '../config/config.ts';
import { getHome as HOME } from './get-home.ts';

export const backupPaths = () => ({
  state: config().HQ_BACKUP_DIR ?? `${HOME()}/.local/share/hq-backup`,
  password: config().HQ_BACKUP_PASSWORD_FILE ?? `${HOME()}/.config/hq/backup-password`,
  remoteEnv: config().HQ_BACKUP_REMOTE_ENV ?? `${HOME()}/.config/hq/backup-remote.env`,
});
