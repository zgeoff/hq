import { existsSync, readFileSync } from 'node:fs';
import { defsSourceFile } from './defs-source-file.ts';

export function rawDefsSource(): string | null {
  const f = defsSourceFile();
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : null;
}
