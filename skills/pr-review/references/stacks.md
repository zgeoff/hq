# stacks

How `pr-review` merges a stack.

A stack merges in one call, never layer by layer: `gh pr merge` refuses a PR in a stack. Merge it only once every layer has cleared review with its head checked, every review thread on every layer has its answer, and `hq review gate` exits 0 for each layer, since the call merges every open layer below the top PR. A layer that `SKILL.md` holds for the owner's lgtm, such as one that changes a repo's `AGENTS.md` or its skills, still needs it; the stack merge itself needs no other yes from him. Use the `gh-stack` skill's merge, never a raw `merge-async` API call, which the classifier refuses as a CI bypass.

Your shell returns to `hq-defs` after each Bash call, so a `cd` on its own never lasts, and `gh stack` takes no `-R` flag: run bare from `hq-defs`, it would act on `hq`'s PR of that number. So start each `gh stack` command with `cd <checkout of the repo> &&`, in a checkout with the top PR's branch checked out. First check that the stack holds exactly the layers you reviewed:

```sh
cd <checkout of the repo> && gh stack view --short
```

Then read the top PR's full head SHA into a variable, whole from GitHub, never pieced together from a short SHA or a copied fragment, and print it:

```sh
top_sha=$(gh pr view <top PR> -R <owner>/<repo> --json headRefOid --jq .headRefOid) && echo "$top_sha"
```

Check that it is the SHA you reviewed. When it differs, the head moved after your review: review again first, since `gh stack merge` takes no head SHA. Then run exactly this line, with nothing else on it: no pipe, no `echo`, no other command:

```sh
cd <checkout of the repo> && gh stack merge <top PR> --yes --squash
```

Check the result with `gh pr view <top PR> -R <owner>/<repo> --json state` in a separate call. The merge is all or nothing: GitHub squash-merges each layer in order, or merges none and reports why; act on the reason it prints. Then check each layer as step 7 says, and hand on every layer's merge in one message.
