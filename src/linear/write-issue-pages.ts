import { join, resolve } from 'node:path';
import type { IssuePage } from './read-issue-pages.ts';
import type { IssueFiles } from './types.ts';

export function writeIssuePages(files: IssueFiles, directory: string, pages: IssuePage[]): string[] {
  return pages.map((issues, index) => {
    const path = resolve(join(directory, `issues-${index + 1}.json`));
    files.writeFileSync(path, JSON.stringify({ issues }));
    return path;
  });
}
