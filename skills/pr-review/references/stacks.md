# Stacks

A stack is a chain of PRs, each built on the one below. GitHub refuses `gh pr merge` on a layer, so
one `gh stack merge` on the top PR squash-merges every open layer, bottom up, all or nothing.

`gh stack` has no `-R` flag and acts on the current folder's repo, and your Bash starts in a
zgeoff/hq checkout. Start each `gh stack` command with `cd <checkout of the stack's repo> &&`. The
classifier refuses a merge line with a pipe or any other command, and a raw `merge-async` call, so
run step 3 exactly as written.

## Before the merge

Every layer: reviewed at its current head, every thread answered, `hq review gate <repo> <pr>` exits
0, and the owner's lgtm on record where SKILL.md's holds need it.

## Merge it

1. In a checkout with the top PR's branch, such as a worktree under `~/projects/<repo>/.worktrees/`,
   check the layers are the ones you reviewed:

   ```sh
   cd <checkout of the stack's repo> && gh stack view --short
   ```

   Review any layer you haven't; ask the agent about any that's missing.

2. `gh stack merge` takes no SHA, so check the top head is still the one you reviewed, using the
   full SHA from GitHub:

   ```sh
   gh pr view <top PR> -R zgeoff/<repo> --json headRefOid --jq .headRefOid
   ```

3. Merge, on a line of its own:

   ```sh
   cd <checkout of the stack's repo> && gh stack merge <top PR> --yes --squash
   ```

   On failure it prints why; act on that.

4. In a separate call, expect `"state": "MERGED"` from
   `gh pr view <top PR> -R zgeoff/<repo> --json state`.
5. Do SKILL.md's After the merge for each layer, and send one message listing each layer's merge
   SHA.
