export class GitReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitReadError';
  }
}
