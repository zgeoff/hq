export function buildFinalKey(ref: string, sha: string): string {
  return `${ref}|${sha}`;
}
