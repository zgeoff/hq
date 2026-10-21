// The PR number of a `repo#n` ref, as text.
export function getPRNumber(ref: string): string {
  return ref.slice(ref.indexOf('#') + 1);
}
