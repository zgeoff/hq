export function collectChangedLines(diff: string): string[] {
  return diff.split('\n').filter((l) => /^[+-]/u.test(l) && !/^(?:\+\+\+|---) /u.test(l));
}
