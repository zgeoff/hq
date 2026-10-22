import { rmSync } from 'node:fs';

// Removes the issue file if it is there. It never throws: a file it cannot remove must not stop the
// review, and the scratch folder is hq's own.
export function removeIssueFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // Left for the next review of the PR, which writes the same path.
  }
}
