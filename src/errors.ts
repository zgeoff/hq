// One error type for every refusal, so --json callers can branch on `code`.
export class HqError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}
