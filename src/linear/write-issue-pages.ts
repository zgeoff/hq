import { join, resolve } from 'node:path';
import type { IssuePage } from './read-issue-pages.ts';
import type { IssueFiles } from './types.ts';

export function writeIssuePages(files: IssueFiles, directory: string, pages: IssuePage[]): string[] {
  const written: string[] = [];
  try {
    for (const [index, issues] of pages.entries()) {
      const path = resolve(join(directory, `issues-${index + 1}.json`));

      // Listed before the write, so a page the failed write cut short goes too.
      written.push(path);
      files.writeFileSync(path, JSON.stringify({ issues }));
    }
  } catch (error) {
    // A cut-short set of pages would read as the whole team, and would refuse the retry.
    const stuck = removePages(files, written);
    if (stuck.length === 0) {
      throw error;
    }
    throw new AggregateError([error, ...stuck.map((left) => left.error)], `a page write failed, and these pages could not be removed: ${stuck.map((left) => left.path).join(', ')}`, { cause: error });
  }
  return written;
}

interface StuckPage {
  path: string;
  error: unknown;
}

// Tries every page, so one failed removal leaves no other page behind.
function removePages(files: IssueFiles, paths: string[]): StuckPage[] {
  const stuck: StuckPage[] = [];
  for (const path of paths) {
    try {
      files.rmSync(path, { force: true });
    } catch (error) {
      stuck.push({ path, error });
    }
  }
  return stuck;
}
