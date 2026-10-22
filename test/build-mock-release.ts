// A release row as GitHub lists it: published, not a draft, not a prerelease, unless `extra` says otherwise.
export function buildMockRelease(tag: string, publishedAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { tag_name: tag, draft: false, prerelease: false, published_at: publishedAt, ...extra };
}
