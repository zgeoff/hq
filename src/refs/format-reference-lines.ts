import type { ReferenceCount } from './types.ts';

// One block per role that owns references: the role, then `<count>  <reference>`, zeros first.
export function formatReferenceLines(counts: ReferenceCount[], days: number): string {
  const roles = [...new Set(counts.map((item) => item.role))];
  if (roles.length === 0) {
    return 'No role owns a skill reference.';
  }
  const blocks = roles.map((role) => {
    const lines = counts
      .filter((item) => item.role === role)
      .toSorted((first, second) => first.count - second.count || first.reference.localeCompare(second.reference))
      .map((item) => `${String(item.count).padStart(4)}  ${item.reference}`);
    return [`${role}: sessions that opened each reference in the last ${days} day(s)`, ...lines].join('\n');
  });
  return blocks.join('\n\n');
}
