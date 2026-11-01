export const PROOF_SECTIONS = ['Skill checks', 'Cold read', 'Deslop'] as const;

export type ProofSection = (typeof PROOF_SECTIONS)[number];

const HEADING = /^ {0,3}#{1,6}[ \t]+(?<title>.*?)[ \t#]*$/u;
const FENCE = /^ {0,3}(?:```|~~~)/u;

export function collectMissingProof(body: string): ProofSection[] {
  const filled = new Set<string>();
  let open: string | null = null;
  let fenced = false;
  for (const line of body.split(/\r?\n/u)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
    }
    const heading = fenced ? null : HEADING.exec(line);
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
