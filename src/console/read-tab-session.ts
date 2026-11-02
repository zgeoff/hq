export function readTabSession(findSession: () => string | null): string {
  try {
    return findSession() ?? '';
  } catch {
    return '';
  }
}
