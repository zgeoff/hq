const HEADING = /^#\s*the owner/iu;

export function parseOwnerPatterns(text: string): string[] | null {
  const patterns: string[] = [];
  let found = false;
  let inSection = false;
  let previousBlank = true;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const isComment = line.startsWith('#');
    if (isComment && HEADING.test(line)) {
      found = true;
      inSection = true;
    } else if (isComment && previousBlank) {
      inSection = false;
    } else if (inSection && !isComment && line !== '') {
      patterns.push(line.split(/\s+/u)[0] ?? line);
    }
    previousBlank = line === '';
  }
  return found ? patterns : null;
}
