export function pickAction(kind: 'review' | 'check', ok: boolean): string {
  if (ok) {
    return kind;
  }
  return `${kind}-failed`;
}
