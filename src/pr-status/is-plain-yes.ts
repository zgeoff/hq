// The option the console stores before ` | ` (or the whole answer) is the owner's decision. Only a
// plain Yes grants: words such as "Yes, but not yet" are the owner's to weigh, never hq's.
export function isPlainYes(answer: string): boolean {
  const option = answer.split(' | ')[0] ?? '';
  return /^yes[.!]?$/iu.test(option.trim());
}
