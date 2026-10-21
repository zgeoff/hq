import type { z } from 'zod';

export function formatIssue(error: z.ZodError): string {
  const [issue] = error.issues;
  return `${formatPath(issue?.path.join('.'))}: ${issue?.message ?? 'bad shape'}`;
}

function formatPath(path: string | undefined): string {
  if (path === undefined || path === '') {
    return 'the output';
  }
  return path;
}
