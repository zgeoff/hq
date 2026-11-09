import { parseIssueLinks } from '../parse-issue-links.ts';

// metadata.createdAt is the PR's own open time, not when Linear attached it.
export interface PRAttachment {
  url: string;
  openedAt: string | null;
}

export interface FiledIssue {
  id: string;
  description: string;
  createdAt: string;
  attachments: readonly PRAttachment[];
}

export type PRBodyReader = (ref: string) => Promise<string | null>;

export async function readPointedPR(issue: FiledIssue, readBody: PRBodyReader): Promise<string | null> {
  const explicit = findExplicitSource(issue.description);
  if (explicit !== null) {
    return explicit;
  }
  for (const ref of collectEarlierPRLinks(issue.attachments, issue.createdAt)) {
    const body = await readBody(ref);
    if (body === null || !isOwnFixPR(body, issue.id)) {
      return ref;
    }
  }
  return findPRLink(issue.description);
}

function findExplicitSource(description: string): string | null {
  const fromLine = /^From (?<ref>[\w.-]+#\d+)/u.exec(description)?.groups?.['ref'];
  if (fromLine) {
    return fromLine;
  }
  return /^[ \t]*(?:[*-][ \t]+)?Found by the .*? agent on (?<ref>[\w.-]+#\d+)/mu.exec(description)?.groups?.['ref'] ?? null;
}

function collectEarlierPRLinks(attachments: readonly PRAttachment[], issueCreatedAt: string): string[] {
  const filedAt = Date.parse(issueCreatedAt);
  return attachments.flatMap((attachment) => {
    const ref = findPRLink(attachment.url);
    return ref !== null && attachment.openedAt !== null && Date.parse(attachment.openedAt) < filedAt ? [ref] : [];
  });
}

export function isOwnFixPR(body: string, issueID: string): boolean {
  return parseIssueLinks(body).some((link) => link.id === issueID);
}

function findPRLink(text: string): string | null {
  const link = /github\.com\/[\w.-]+\/(?<repo>[\w.-]+)\/pull\/(?<number>\d+)/u.exec(text)?.groups;
  if (!link?.['repo'] || !link['number']) {
    return null;
  }
  return `${link['repo']}#${link['number']}`;
}
