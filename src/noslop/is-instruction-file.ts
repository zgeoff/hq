// A repo's instruction file: AGENTS.md at any depth, or a file under .claude/skills/ or skills/,
// except a test file or test data.
export function isInstructionFile(path: string): boolean {
  if (/(?:^|\/)AGENTS\.md$/u.test(path)) {
    return true;
  }
  if (!/(?:^|\/)(?:\.claude\/skills|skills)\//u.test(path)) {
    return false;
  }
  const name = path.split('/').at(-1) ?? '';
  return !name.includes('.test.') && !path.includes('/testdata/') && !path.includes('/__tests__/');
}
