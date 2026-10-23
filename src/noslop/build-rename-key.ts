export function buildRenameKey(from: string, to: string): string {
  return `${from}\0${to}`;
}
