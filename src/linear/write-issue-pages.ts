import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { IssuePage } from './read-issue-pages.ts';

export function writeIssuePages(directory: string, pages: IssuePage[]): string[] {
  return pages.map((issues, index) => {
    const path = resolve(join(directory, `issues-${index + 1}.json`));
    writeFileSync(path, JSON.stringify({ issues }));
    return path;
  });
}
