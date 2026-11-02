import type { FleetEntry, PluginDrift, PromptDrift } from './types.ts';

export function buildFleetChecks(entry: FleetEntry, prompt: PromptDrift | undefined, plugins: PluginDrift | undefined): FleetEntry & { promptCheck?: PromptDrift; pluginCheck?: PluginDrift } {
  return { ...entry, ...(prompt ? { promptCheck: prompt } : {}), ...(plugins ? { pluginCheck: plugins } : {}) };
}
