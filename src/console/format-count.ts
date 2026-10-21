export function formatCount(count: number, word: string): string {
  return count === 1 ? `1 ${word}` : `${count} ${word}s`;
}
