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

export interface PRLink {
  owner: string;
  repo: string;
  number: string;
}

export type PRBodyReader = (link: PRLink) => Promise<string | null>;

// hq reads PRs only in the zgeoff repos, so another owner's PR counts with no read.
const READ_OWNER = 'zgeoff';

export async function readPointedPR(issue: FiledIssue, readBody: PRBodyReader): Promise<string | null> {
  const explicit = findExplicitSource(issue.description);
  if (explicit !== null) {
    return explicit;
  }
  for (const link of collectEarlierPRLinks(issue.attachments, issue.createdAt)) {
    if (link.owner !== READ_OWNER) {
      return toPRRef(link);
    }
    const body = await readBody(link);
    if (body === null || !isOwnFixPR(body, issue.id)) {
      return toPRRef(link);
    }
  }
  const described = findPRLink(issue.description);
  return described === null ? null : toPRRef(described);
}

function findExplicitSource(description: string): string | null {
  const fromLine = /^From (?<ref>[\w.-]+#\d+)/u.exec(description)?.groups?.['ref'];
  if (fromLine) {
    return fromLine;
  }
  return /^[ \t]*(?:[*-][ \t]+)?Found by the .*? agent on (?<ref>[\w.-]+#\d+)/mu.exec(description)?.groups?.['ref'] ?? null;
}

function collectEarlierPRLinks(attachments: readonly PRAttachment[], issueCreatedAt: string): PRLink[] {
  const filedAt = Date.parse(issueCreatedAt);
  return attachments.flatMap((attachment) => {
    const link = findPRLink(attachment.url);
    return link !== null && attachment.openedAt !== null && Date.parse(attachment.openedAt) < filedAt ? [link] : [];
  });
}

function findPRLink(text: string): PRLink | null {
  const link = /github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/pull\/(?<number>\d+)/u.exec(text)?.groups;
  if (!link?.['owner'] || !link['repo'] || !link['number']) {
    return null;
  }
  return { owner: link['owner'], repo: link['repo'], number: link['number'] };
}

function toPRRef(link: PRLink): string {
  return `${link.repo}#${link.number}`;
}

export function isOwnFixPR(body: string, issueID: string): boolean {
  return parseIssueLinks(body).some((link) => link.id.toUpperCase() === issueID.toUpperCase());
}
