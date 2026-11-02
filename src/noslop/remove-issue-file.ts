import { rmSync } from 'node:fs';

export function removeIssueFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // Left for the next review of the PR, which writes the same path.
  }
}
