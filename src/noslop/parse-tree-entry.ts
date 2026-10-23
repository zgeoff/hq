// absent: git lists nothing for the path; entry: git's `<mode> <type> <object>`; unexpected: git
// listed another path or more than one, as a directory path with a trailing slash would.
export type TreeEntry = { kind: 'absent' } | { kind: 'entry'; entry: string } | { kind: 'unexpected'; count: number };

// One path's line of `git ls-tree -z` output. With -z, git ends each line with a NUL and quotes no
// path.
export function parseTreeEntry(output: string, path: string): TreeEntry {
  const lines = output.split('\0').filter((line) => line !== '');
  if (lines.length === 0) {
    return { kind: 'absent' };
  }
  const [entry = '', listedPath] = lines[0]?.split('\t') ?? [];
  return lines.length === 1 && listedPath === path ? { kind: 'entry', entry } : { kind: 'unexpected', count: lines.length };
}
