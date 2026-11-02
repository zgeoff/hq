// A PR attachment as Linear gives it: the URL, and when the PR opened (metadata.createdAt, the PR's own
// open time, not when Linear attached it), or null when Linear gave none.
export interface PRAttachment {
  url: string;
  openedAt: string | null;
}

// The PR an issue was filed from, as repo#n, or null. The description's From and Found by lines come
// first, then a PR attachment that opened before the issue (a later one is its own delivery PR), then a
// PR link in the description.
export function findPointedPR(description: string, attachments: readonly PRAttachment[], issueCreatedAt: string): string | null {
  const fromLine = /^From (?<ref>[\w.-]+#\d+)/u.exec(description)?.groups?.['ref'];
  if (fromLine) {
    return fromLine;
  }

  // Only a line that starts with it, after any list marker: the words inside a sentence or a quote are
  // about another issue.
  const foundBy = /^[ \t]*(?:[*-][ \t]+)?Found by the .*? agent on (?<ref>[\w.-]+#\d+)/mu.exec(description)?.groups?.['ref'];
  if (foundBy) {
    return foundBy;
  }
  const filedAt = Date.parse(issueCreatedAt);
  for (const attachment of attachments) {
    const attached = findPRLink(attachment.url);
    if (attached && attachment.openedAt !== null && Date.parse(attachment.openedAt) < filedAt) {
      return attached;
    }
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
