const REBASED = /^rebased:[0-9a-f]{40}$/u;

export function isRebasedSource(source: string): boolean {
  return REBASED.test(source);
}
