// A 40-character hex commit id for an invented commit number.
export function buildMockSha(number: number): string {
  return number.toString(16).padStart(40, '0');
}
