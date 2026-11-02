import type { NotReviewedFile } from './parse-review-run.ts';

export function formatNotReviewed(files: readonly NotReviewedFile[]): string[] {
  if (files.length === 0) {
    return [];
  }
  return [`== not reviewed by noslop: ${files.length} file(s), check them by hand`, ...files.map((file) => `  - ${file.path} (${file.reason})`)];
}
