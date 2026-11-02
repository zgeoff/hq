import { readFileSync, writeFileSync } from 'node:fs';

export function readChangingFile(path: string, replacement: string, nthRead: number): (target: string) => string {
  let reads = 0;
  return (target) => {
    if (target === path) {
      reads++;
      if (reads === nthRead) {
        writeFileSync(path, replacement);
      }
    }
    return readFileSync(target, 'utf8');
  };
}
