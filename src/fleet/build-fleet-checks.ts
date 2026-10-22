import type { FleetEntry, PluginDrift, PromptDrift } from './types.ts';

// A declared entry for `hq fleet --json`, with its prompt check and its plugin folder mismatch
// beside it when there is one.
export function buildFleetChecks(entry: FleetEntry, prompt: PromptDrift | undefined, plugins: PluginDrift | undefined): FleetEntry & { promptCheck?: PromptDrift; pluginCheck?: PluginDrift } {
  return { ...entry, ...(prompt ? { promptCheck: prompt } : {}), ...(plugins ? { pluginCheck: plugins } : {}) };
}
