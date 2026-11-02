export class HqError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}
