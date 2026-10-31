// Whether the issue's Scope checklist shows every other area done: each has a ticked box that names
// it. An issue with no box for an area is not its last, so the brief says Contributes to.
export function isLastArea(description: string, otherAreas: readonly string[]): boolean {
  const ticked = description.split('\n').filter((line) => /^\s*[-*] \[[xX]\] /u.test(line));
  return otherAreas.every((area) => ticked.some((line) => new RegExp(`(^|[^a-z0-9-])${area}($|[^a-z0-9-])`, 'iu').test(line)));
}
