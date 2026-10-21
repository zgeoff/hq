import type { RunState } from '../transitions/run-states.ts';

export const SHIPPABLE: RunState[] = ['merged', 'deploying', 'deploy-held'];
