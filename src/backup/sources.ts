import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config/config.ts';
import { dbPath } from '../db/db-path.ts';
import { getHome as HOME } from './get-home.ts';

// What goes in: the staged hq.db, the rest of z-sessions, and the transcripts of the
// sessions hq serves (the frankie-main and hq-defs workspaces, and hq's own).
export function sources(): { db: string; dirs: string[]; exclude: string[] } {
  const db = config().HQ_BACKUP_DB ?? dbPath();
  const dirs = config().HQ_BACKUP_DIRS;
  if (dirs) return { db, dirs: dirs.split(':').filter(Boolean), exclude: [db, `${db}-wal`, `${db}-shm`] };
  const projects = `${HOME()}/.claude/projects`;
  const transcripts = existsSync(projects)
    ? readdirSync(projects)
        .filter((d) => /^-home-[^/]*-local-share-atc-workspaces-(frankie-main|hq-defs$)/.test(d) || d.endsWith('-projects-hq'))
        .map((d) => join(projects, d))
    : [];
  return { db, dirs: [dirname(db), ...transcripts], exclude: [db, `${db}-wal`, `${db}-shm`] };
}
