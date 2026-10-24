// This tab's console session, or '' when it holds none or the browser blocks its storage.
export function readTabSession(findSession: () => string | null): string {
  try {
    return findSession() ?? '';
  } catch {
    return '';
  }
}
