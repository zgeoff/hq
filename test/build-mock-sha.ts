export function buildMockSha(number: number): string {
  return number.toString(16).padStart(40, '0');
}
