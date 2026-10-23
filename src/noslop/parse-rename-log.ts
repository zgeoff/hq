// The renames in `git log -z --name-status --diff-filter=R` output, as old and new path. With -z,
// git ends each status and each path with a NUL and quotes no path.
export function parseRenameLog(output: string): [from: string, to: string][] {
  const tokens = output.split('\0').filter((token) => token !== '');
  const renames: [string, string][] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const from = tokens[index + 1];
    const to = tokens[index + 2];
    if (tokens[index]?.startsWith('R') === true && from !== undefined && to !== undefined) {
      renames.push([from, to]);
      index += 2;
    }
  }
  return renames;
}
