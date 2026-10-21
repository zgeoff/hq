// bun build --define replaces this dotted read with a literal; nothing at run time can set it, so a
// run from source cannot pass for an installed build.
declare global {
  var HQ_BUILD: { commit: string; dirty: boolean } | undefined;
}

export interface Build {
  commit: string | null;
  dirty: boolean | null;
}

export function readBuild(): Build {
  const build = globalThis.HQ_BUILD;
  if (build === undefined) {
    return { commit: null, dirty: null };
  }
  return { commit: build.commit, dirty: build.dirty };
}
