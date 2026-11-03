export const PROOF_LINES = {
  'chex prose, links and skill': /^chex prose, links and skill: cleared\.?$/iu,
  'Cold read': /^Cold read(?: \([^)]*\))?: \d+ fixed, \d+ declined\.?$/iu,
  Deslop: /^Deslop: \d+ edits?\.?$/iu,
} as const;

export type ProofLine = keyof typeof PROOF_LINES;

const PROOF_NAMES = Object.keys(PROOF_LINES).filter((name): name is ProofLine => name in PROOF_LINES);

export type MissingProof = { kind: 'line'; line: ProofLine } | { kind: 'declined'; counted: number; listed: number };

const HEADING = /^ {0,3}#{1,6}[ \t]+(?<title>.*?)[ \t#]*$/u;
const FENCE = /^ {0,3}(?<marker>`{3,}|~{3,})(?<info>.*)$/u;
const COMMENT = /<!--[\s\S]*?-->/gu;
const BOX = /^\s*[-*][ \t]+\[(?<mark>[ xX])\][ \t]+(?<text>.*)$/u;
const DECLINED_COUNT = /: \d+ fixed, (?<count>\d+) declined\.?$/iu;

export function collectMissingProof(body: string): MissingProof[] {
  const lines = pickChecksLines(body.replaceAll(COMMENT, ''));
  const ticked = lines.flatMap((line) => {
    const box = BOX.exec(line)?.groups;
    return box !== undefined && box['mark'] !== ' ' ? [(box['text'] ?? '').trim()] : [];
  });
  const missing: MissingProof[] = PROOF_NAMES.filter((name) => !ticked.some((text) => PROOF_LINES[name].test(text))).map((line) => ({ kind: 'line', line }));
  const counted = ticked.reduce((sum, text) => sum + Number(DECLINED_COUNT.exec(text)?.groups?.['count'] ?? 0), 0);
  const listed = countDeclined(lines);
  if (listed < counted) {
    missing.push({ kind: 'declined', counted, listed });
  }
  return missing;
}

function pickChecksLines(body: string): string[] {
  const lines: string[] = [];
  let open = false;
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/u)) {
    const marker = FENCE.exec(line)?.groups ?? null;
    if (fence === null && marker !== null) {
      fence = marker['marker'] ?? null;
      continue;
    }
    if (fence !== null) {
      if (marker !== null && isClosingFence(fence, marker['marker'] ?? '', marker['info'] ?? '')) {
        fence = null;
      }
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      open = (heading.groups?.['title'] ?? '').trim().toLowerCase() === 'checks';
      continue;
    }
    if (open) {
      lines.push(line);
    }
  }
  return lines;
}

const DECLINED_HEAD = /^\s*Declined:/u;
const FINDING = /^ {0,1}[-*][ \t]+(?!\[[ xX]\])(?!<review>)(?!<the finding>)\S/u;

function countDeclined(lines: string[]): number {
  const start = lines.findIndex((line) => DECLINED_HEAD.test(line));
  return start === -1 ? 0 : lines.slice(start + 1).filter((line) => FINDING.test(line)).length;
}

function isClosingFence(open: string, marker: string, info: string): boolean {
  return marker.startsWith(open.charAt(0)) && marker.length >= open.length && info.trim() === '';
}
