const SOURCE = /^(?:chat|console|call):\S+$/u;

// Whether a source names where the owner gave an answer: chat:<id>, console:<id> or call:<id>.
export function isAnswerSource(source: string): boolean {
  return SOURCE.test(source);
}
