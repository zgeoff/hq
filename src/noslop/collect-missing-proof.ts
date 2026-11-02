export const PROOF_SECTIONS = ['Skill checks', 'Cold read', 'Deslop'] as const;

export type ProofSection = (typeof PROOF_SECTIONS)[number];

const HEADING = /^ {0,3}#{1,6}[ \t]+(?<title>.*?)[ \t#]*$/u;
const FENCE = /^ {0,3}(?<marker>`{3,}|~{3,})(?<info>.*)$/u;

export function collectMissingProof(body: string): ProofSection[] {
  const filled = new Set<string>();
  let open: string | null = null;
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/u)) {
    const marker = FENCE.exec(line)?.groups ?? null;
    if (fence === null && marker !== null) {
      fence = marker['marker'] ?? null;
    } else if (fence !== null && marker !== null && isClosingFence(fence, marker['marker'] ?? '', marker['info'] ?? '')) {
      fence = null;
    }
    const heading = fence === null && marker === null ? HEADING.exec(line) : null;
    if (heading !== null) {
      open = (heading.groups?.['title'] ?? '').trim().toLowerCase();
      continue;
    }
    if (open !== null && line.trim() !== '') {
      filled.add(open);
    }
  }
  return PROOF_SECTIONS.filter((section) => !filled.has(section.toLowerCase()));
}

function isClosingFence(open: string, marker: string, info: string): boolean {
  return marker.startsWith(open.charAt(0)) && marker.length >= open.length && info.trim() === '';
}
