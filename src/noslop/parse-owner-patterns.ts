const HEADING = /^#\s*the owner/iu;

// The patterns of the owner section of a CODEOWNERS file, or null when it has none. The section
// opens at a comment starting "the owner" and ends at the next comment that opens a new heading.
export function parseOwnerPatterns(text: string): string[] | null {
  const patterns: string[] = [];
  let found = false;
  let inSection = false;
  let previousComment = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const isComment = line.startsWith('#');
    if (isComment && HEADING.test(line)) {
      found = true;
      inSection = true;
    } else if (isComment && !previousComment) {
      inSection = false;
    } else if (inSection && !isComment && line !== '') {
      patterns.push(line.split(/\s+/u)[0] ?? line);
    }
    previousComment = isComment;
  }
  return found ? patterns : null;
}
