const REBASED = /^rebased:[0-9a-f]{40}$/u;

// Whether a source is `rebased:<old head>`, the one only `hq pr rebased` writes: the owner's lgtm at
// the old head, carried to a head that changes no content of the diff.
export function isRebasedSource(source: string): boolean {
  return REBASED.test(source);
}
