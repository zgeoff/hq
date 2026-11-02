const SOURCE = /^(?:chat|console|call):\S+$/u;

export function isAnswerSource(source: string): boolean {
  return SOURCE.test(source);
}
