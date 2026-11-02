export function buildRunDir(base: string, sha: string): string {
  return `${base}-${sha}`;
}
