export interface StaleCommit {
  commit: string;
  subject: string;
}

// A drift `since` is `<hash> <subject>` for a prompt on main, or a file's mtime for a local one.
export function parseStaleCommit(since: string | null): StaleCommit {
  if (since === null) {
    return { commit: 'unknown', subject: 'no commit found' };
  }
  const match = /^(?<hash>[0-9a-f]{7,40}) (?<subject>.*)$/u.exec(since);
  if (!match?.groups) {
    return { commit: since, subject: 'the local prompt file changed' };
  }
  return { commit: match.groups['hash'] ?? since, subject: match.groups['subject'] ?? '' };
}
