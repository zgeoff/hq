export function buildMockRelease(tag: string, publishedAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { tag_name: tag, draft: false, prerelease: false, published_at: publishedAt, ...extra };
}
