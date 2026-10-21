// github.com/<owner>/<repo>, over https or ssh, with or without .git.
export function originMatches(url: string | null, repo: string): boolean {
  if (!url) return false;
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url);
  return !!m && m[1]!.toLowerCase() === repo.toLowerCase();
}
