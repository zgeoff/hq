import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RESTIC_TEST_PASSWORD, createResticTemplates } from './create-restic-templates.ts';

export function createResticRepo(repo: string, passwordFile: string, kind: 'local' | 'remote'): void {
  mkdirSync(dirname(passwordFile), { recursive: true, mode: 0o700 });
  writeFileSync(passwordFile, `${RESTIC_TEST_PASSWORD}\n`, { mode: 0o600 });
  mkdirSync(dirname(repo), { recursive: true });
  cpSync(join(createResticTemplates(), kind), repo, { recursive: true });
}
