// metadata.createdAt is the PR's own open time, not when Linear attached it. body is absent until
// something reads the PR's description.
export interface PRAttachment {
  url: string;
  openedAt: string | null;
  body?: string;
}

export function findPointedPR(description: string, attachments: readonly PRAttachment[], issueCreatedAt: string, issueID: string): string | null {
  const explicit = findExplicitSource(description);
  if (explicit !== null) {
    return explicit;
  }
  for (const attachment of collectEarlierPRAttachments(attachments, issueCreatedAt)) {
    if (attachment.body === undefined || !isOwnFixPR(attachment.body, issueID)) {
      return findPRLink(attachment.url);
    }
  }
  return findPRLink(description);
}

export function findExplicitSource(description: string): string | null {
  const fromLine = /^From (?<ref>[\w.-]+#\d+)/u.exec(description)?.groups?.['ref'];
  if (fromLine) {
    return fromLine;
  }
  return /^[ \t]*(?:[*-][ \t]+)?Found by the .*? agent on (?<ref>[\w.-]+#\d+)/mu.exec(description)?.groups?.['ref'] ?? null;
}

export function collectEarlierPRAttachments(attachments: readonly PRAttachment[], issueCreatedAt: string): PRAttachment[] {
  const filedAt = Date.parse(issueCreatedAt);
  return attachments.filter((attachment) => findPRLink(attachment.url) !== null && attachment.openedAt !== null && Date.parse(attachment.openedAt) < filedAt);
}

export function isOwnFixPR(body: string, issueID: string): boolean {
  const escaped = issueID.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(`^[ \\t]*(?:[*-][ \\t]+)?(?:Fixes|Contributes to|Related to) ${escaped}(?!\\w)`, 'mu').test(body);
}

export function findPRLink(text: string): string | null {
  const link = /github\.com\/[\w.-]+\/(?<repo>[\w.-]+)\/pull\/(?<number>\d+)/u.exec(text)?.groups;
  if (!link?.['repo'] || !link['number']) {
    return null;
  }
  return `${link['repo']}#${link['number']}`;
}
