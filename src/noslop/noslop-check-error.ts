import { HqError } from '../errors.ts';

export class NoslopCheckError extends HqError {
  readonly why: string;

  constructor(message: string, why: string) {
    super('noslop_failed', message);
    this.name = 'NoslopCheckError';
    this.why = why;
  }
}
