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
    for (const path of written) {
      files.rmSync(path, { force: true });
    }
    throw error;
  }
  return written;
}
