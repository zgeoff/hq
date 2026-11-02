export function buildGithubAttachment(number: number, status: string, mergedAt: string | null = null) {
  return { url: `https://github.com/zgeoff/kettle/pull/${number}`, sourceType: 'github', metadata: { status, mergedAt, number, repoName: 'kettle', repoLogin: 'zgeoff' } };
}
