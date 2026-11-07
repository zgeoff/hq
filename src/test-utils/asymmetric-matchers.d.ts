// bun:test types every asymmetric matcher as `any`, which flows into any object literal it sits in.
declare module 'bun:test' {
  interface AsymmetricMatchers {
    any: (constructor: ((...args: never[]) => unknown) | (new (...args: never[]) => unknown)) => never;
    anything: () => never;
    arrayContaining: <E = unknown>(arr: readonly E[]) => never;
    objectContaining: (obj: object) => never;
    stringContaining: (str: string) => never;
    stringMatching: (regex: string | RegExp) => never;
    closeTo: (num: number, numDigits?: number) => never;
  }
}
