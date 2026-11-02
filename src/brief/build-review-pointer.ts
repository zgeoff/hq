export const REVIEW_LINES_PATH = 'agent-kit/review-lines.md';

// A pointer in place of noslop's rules themselves: they run near 4,000 bytes, the whole limit of
// a launch prompt.
export function buildReviewPointer(repo: string, sha: string): string {
  return `Before you write code, read noslop's rules, with <repo> as ${repo}: gh api 'repos/zgeoff/hq/contents/${REVIEW_LINES_PATH}?ref=${sha}' -H 'Accept: application/vnd.github.raw'`;
}
