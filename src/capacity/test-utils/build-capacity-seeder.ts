import { seedCapacitySample } from './seed-capacity-sample.ts';
import { seedCapacitySampleWithEmptyErrors } from './seed-capacity-sample-with-empty-errors.ts';
import { seedCapacitySampleWithErrorsNotJSON } from './seed-capacity-sample-with-errors-not-json.ts';
import { seedCapacitySampleWithNonTextError } from './seed-capacity-sample-with-non-text-error.ts';
import type { CapacityDeps } from './types.ts';

export function buildCapacitySeeder(deps: CapacityDeps) {
  return {
    capacitySample: (input?: Parameters<typeof seedCapacitySample>[1]) => seedCapacitySample(deps, input),
    capacitySampleWithEmptyErrors: (input?: Parameters<typeof seedCapacitySampleWithEmptyErrors>[1]) => seedCapacitySampleWithEmptyErrors(deps, input),
    capacitySampleWithErrorsNotJSON: (input?: Parameters<typeof seedCapacitySampleWithErrorsNotJSON>[1]) => seedCapacitySampleWithErrorsNotJSON(deps, input),
    capacitySampleWithNonTextError: (input?: Parameters<typeof seedCapacitySampleWithNonTextError>[1]) => seedCapacitySampleWithNonTextError(deps, input),
  };
}
