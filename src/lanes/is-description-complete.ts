// The sections every issue fills before it leaves Backlog (skills/linear-triage/references/tickets.md).
// Design and Investigation issues ask questions where other issues set a scope.
const REQUIRED: string[][] = [['outcome'], ['context'], ['scope', 'questions to settle', 'questions to answer'], ['acceptance'], ['actions']];

// A body line that holds no content: a bare bullet or box, TBD, TODO, an ellipsis or an <angle> slot.
const PLACEHOLDER_LINE = /^(?:[-*+]\s*(?:\[[ x]?\]\s*)?)?(?:tbd|todo|tba|\.{3}|…|<[^<>]*>)?\s*$/iu;

export function isDescriptionComplete(description: string | null): boolean {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of (description ?? '').replaceAll(/<!--[\s\S]*?-->/gu, '').split('\n')) {
    const heading = /^##\s+(?<name>.+?)\s*#*\s*$/u.exec(line);
    if (heading?.groups?.['name'] === undefined) {
      current?.push(line);
      continue;
    }
    current = [];
    sections.set(heading.groups['name'].toLowerCase(), current);
  }
  return REQUIRED.every((names) => names.some((name) => (sections.get(name) ?? ['']).some((line) => !PLACEHOLDER_LINE.test(line.trim()))));
}
