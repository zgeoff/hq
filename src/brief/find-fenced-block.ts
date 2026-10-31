const FENCE = /^```text\n(?<body>[\s\S]*?)\n```$/mu;

// The body of the first ```text fence at or after the marker line (the first one when the marker
// is null), without the fences; null when the text has no marker or no such fence after it.
export function findFencedBlock(text: string, marker: string | null): string | null {
  const from = marker === null ? 0 : text.indexOf(marker);
  if (from === -1) {
    return null;
  }
  return FENCE.exec(text.slice(from))?.groups?.['body'] ?? null;
}
