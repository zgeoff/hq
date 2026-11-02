export function getPRNumber(ref: string): string {
  return ref.slice(ref.indexOf('#') + 1);
}
