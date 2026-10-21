export interface PRAuthor {
  login?: string | undefined;
  is_bot?: boolean | undefined;
}

export function isBotAuthor(author: PRAuthor): boolean {
  const login = author.login ?? '';
  return author.is_bot === true || login.endsWith('[bot]') || login.startsWith('app/');
}
