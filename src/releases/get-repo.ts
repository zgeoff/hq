export function getRepo(ref: string): string {
  return ref.slice(0, ref.indexOf('#'));
}
