export type TreeEntry = { kind: 'absent' } | { kind: 'entry'; entry: string } | { kind: 'unexpected'; count: number };

// With -z, git ends each line with a NUL and quotes no path.
export function parseTreeEntry(output: string, path: string): TreeEntry {
  const lines = output.split('\0').filter((line) => line !== '');
  if (lines.length === 0) {
    return { kind: 'absent' };
  }
  const [entry = '', listedPath] = lines[0]?.split('\t') ?? [];
  return lines.length === 1 && listedPath === path ? { kind: 'entry', entry } : { kind: 'unexpected', count: lines.length };
}
