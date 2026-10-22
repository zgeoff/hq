// The PR an issue points at, as repo#n: a GitHub PR attachment, a first line "From <repo>#<n>", a
// "Found by the GEO-n agent on <repo>#<n>" line, or a PR link in the description. Null when none.
export function findPointedPR(description: string, attachmentURLs: readonly string[]): string | null {
  for (const url of attachmentURLs) {
    const attached = findPRLink(url);
    if (attached) {
      return attached;
    }
  }
  const fromLine = /^From (?<ref>[\w.-]+#\d+)/u.exec(description)?.groups?.['ref'];
  if (fromLine) {
    return fromLine;
  }
  const foundBy = /Found by the .*? agent on (?<ref>[\w.-]+#\d+)/u.exec(description)?.groups?.['ref'];
  if (foundBy) {
    return foundBy;
  }
  return findPRLink(description);
}

function findPRLink(text: string): string | null {
  const link = /github\.com\/[\w.-]+\/(?<repo>[\w.-]+)\/pull\/(?<number>\d+)/u.exec(text)?.groups;
  if (!link?.['repo'] || !link['number']) {
    return null;
  }
  return `${link['repo']}#${link['number']}`;
}
