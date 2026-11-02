// metadata.createdAt is the PR's own open time, not when Linear attached it.
export interface PRAttachment {
  url: string;
  openedAt: string | null;
}

export function findPointedPR(description: string, attachments: readonly PRAttachment[], issueCreatedAt: string): string | null {
  const fromLine = /^From (?<ref>[\w.-]+#\d+)/u.exec(description)?.groups?.['ref'];
  if (fromLine) {
    return fromLine;
  }

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
