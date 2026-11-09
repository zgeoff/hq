import { z } from 'zod';

type StartedPRStatus = 'open' | 'draft' | 'merged' | 'closed';

export interface StartedPR {
  ref: string;
  status: StartedPRStatus;
  mergedAt: string | null;
}

const attachmentSchema = z.object({ url: z.string().nullish(), sourceType: z.string().nullish(), metadata: z.unknown() });
const metadataSchema = z.object({
  status: z.enum(['open', 'draft', 'merged', 'closed']),
  mergedAt: z.string().nullish(),
  number: z.number().int().nullish(),
  repoName: z.string().nullish(),
});

export function parseStartedPRs(attachments: readonly unknown[]): StartedPR[] {
  const prs = new Map<string, StartedPR>();
  for (const raw of attachments) {
    const attachment = attachmentSchema.safeParse(raw);
    const metadata = attachment.success ? metadataSchema.safeParse(attachment.data.metadata) : null;
    if (!attachment.success || attachment.data.sourceType !== 'github' || metadata === null || !metadata.success) {
      continue;
    }
    const ref = pickRef(metadata.data.repoName, metadata.data.number, attachment.data.url);
    if (ref !== null) {
      prs.set(ref, { ref, status: metadata.data.status, mergedAt: metadata.data.status === 'merged' ? (metadata.data.mergedAt ?? null) : null });
    }
  }
  return [...prs.values()];
}

function pickRef(repoName: string | null | undefined, number: number | null | undefined, url: string | null | undefined): string | null {
  if (repoName && number) {
    return `${repoName.split('/').at(-1)}#${number}`;
  }
  const match = /github\.com\/[\w.-]+\/(?<repo>[\w.-]+)\/pull\/(?<number>\d+)/u.exec(url ?? '');
  return match?.groups === undefined ? null : `${match.groups['repo']}#${match.groups['number']}`;
}
