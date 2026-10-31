# Chore

Do the maintenance the ticket names, and show that it changes nothing for the people who use the
product, or for code that imports this repo's packages. `bun verify` drives a feature as a user
would; the repo's `verify-<app>` skill lists what it can drive. Without either, skip that part of
step 3 and say so in the PR.

1. Do the maintenance. Fix what you meet along the way. Before you remove code you don't understand,
   use the `why` skill. When it shows the code is still needed, keep it, and say why in the PR.
2. Run the repo's test command. Fix each test that fails only on your branch. When a test also fails
   on the base branch, it was broken before you came: say so in the PR, and leave it.
3. Find the features your change can reach: each one whose code you changed, and for a dependency or
   config bump, each one that uses what you bumped. Drive each with `bun verify` on the base branch,
   from a second worktree, and on yours. Compare the outputs, ignoring values that change on every
   run, such as timestamps.
4. When the repo publishes a package, compare its exports on the base branch and on yours.
5. A difference in step 3 or 4 means someone would see the change. When you find one, keep the
   change, open a draft PR that says what differs, and send a `decision` note. End your turn there,
   and wait for the answer.
6. In the PR description, under "## Verification", give the test command and each `bun verify`
   command, with a one-line result and the part of its output that shows no change.
