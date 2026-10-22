// A git read in the fixes-only rule failed, so hq cannot tell what the commits since the last
// review hold.
export class GitReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitReadError';
  }
}
