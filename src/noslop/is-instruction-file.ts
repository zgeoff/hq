export function isInstructionFile(path: string): boolean {
  if (/(?:^|\/)AGENTS\.md$/u.test(path)) {
    return true;
  }
  if (!/(?:^|\/)(?:\.claude\/skills|skills)\//u.test(path)) {
    return false;
  }
  const name = path.split('/').at(-1) ?? '';
  return name.endsWith('.md') && !path.includes('/testdata/') && !path.includes('/__tests__/');
}
