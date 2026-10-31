import { readFileSync, writeFileSync } from 'node:fs';

// A reader of real files that lets another writer change one file between two reads: the nth read of
// the given path first overwrites it with the replacement. Every other read passes through.
export function buildStubChangingReader(path: string, replacement: string, nthRead: number): (target: string) => string {
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
