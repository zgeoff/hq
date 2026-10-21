import type { NotReviewedFile } from './parse-review-run.ts';

// `hq review`'s lines for the changed files no noslop call read, so z-review checks them itself;
// none when every file was read.
export function formatNotReviewed(files: readonly NotReviewedFile[]): string[] {
  if (files.length === 0) {
    return [];
  }
  return [`== not reviewed by noslop: ${files.length} file(s), check them by hand`, ...files.map((file) => `  - ${file.path} (${file.reason})`)];
}
