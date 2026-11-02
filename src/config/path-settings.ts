import { CONFIG_SHAPE } from './config-shape.ts';

export const PATH_SETTINGS: ReadonlyMap<string, string> = new Map(
  Object.entries(CONFIG_SHAPE).flatMap(([name, setting]) => (setting.description ? [[name, setting.description] as const] : [])),
);
