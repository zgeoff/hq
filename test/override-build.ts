export function overrideBuild(build: typeof globalThis.HQ_BUILD): () => void {
  const saved = globalThis.HQ_BUILD;
  globalThis.HQ_BUILD = build;
  return () => {
    globalThis.HQ_BUILD = saved;
  };
}
