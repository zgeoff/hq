import { CONFIG_SHAPE } from './config-shape.ts';

// Each setting that names a file or directory, mapped to whether it holds one path or a list.
export const PATH_SETTINGS: ReadonlyMap<string, string> = new Map(
  Object.entries(CONFIG_SHAPE).flatMap(([name, setting]) => (setting.description ? [[name, setting.description] as const] : [])),
);
