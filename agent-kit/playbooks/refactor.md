# Refactor

Change the structure, and keep the behaviour, except where you fix a bug you found. A passing type
check doesn't prove the behaviour stayed the same, and a refactor can end no simpler than what it
replaced; the steps guard against both.

The area is the files the ticket names and the code that calls them directly. `bun verify` drives a
feature as a user would; the feature map in the repo's `verify-<app>` skill lists what it drives.

1. Before you move any code, record what the area does today:
   - Run the tests that import the area's files. When they leave a function in the area untested,
     write tests for what it does today, and commit them first. When a test already fails, stop.
     Send a `decision` note, and wait for the answer.
   - When the area holds a feature in the feature map, drive it with `bun verify`, and keep the
     output.
2. Open a draft PR, and write the structure you're aiming for in its description: the module layout,
   the types, and which module calls which.
3. Before you remove code you don't understand, use the `why` skill.
4. Before you move any code, delete what nobody needs. That's dead code, and a check on input that
   another check already made on the same path. Keep the check closest to where the input enters.
   Commit all the deletions as one commit.
5. Inline each function that only passes its arguments on to another, and has one caller. Then move
   code in small steps. After each step, run the step 1 tests. When the same edit repeats across
   more than about 10 files, write a codemod, and commit the edits it makes but not the codemod.
6. When an exported function or type changes, move every caller to the new one, and delete the old
   one in the same PR. Before you finish, search for the old name. A rename can miss uses in
   strings, docs and comments. When the ticket says this PR is one step of a migration across
   several PRs, keep the old code that the old callers still need. List each piece under "## Not
   changed" in the PR description, for the migration's cleanup.
7. Fix each bug you find in the area, in this PR, as its own commit with a test that fails without
   the fix. When the fix changes what one of the step 1 tests expects, update that test, and say why
   in the commit. List a bug outside the area in the PR.
8. Compare the code with what it replaced. For each exported function in the area, count the
   branches, and the calls a reader follows to reach the code that does the work. When neither count
   dropped, revert every commit from steps 4 to 6. Keep the tests and the bug fixes, and say why in
   the PR.
9. Use the `blast-radius` skill on the commits from steps 4 to 6. They're meant to change no
   behaviour a caller can see, apart from the renames step 6 makes on purpose. Treat any other
   change it finds, such as a different error message, as a bug in your refactor, and fix it.
10. Run the step 1 tests again. Expect them all to pass. When you kept `bun verify` output in step
    1, run it again. Expect the same end state.
11. In the PR description, under "## Verification", give the test command and its result, both
    `bun verify` outputs, and one line on what got simpler, or on why you reverted. Under "## Fixed
    on the way", list each bug you fixed, with its commit and its test, or write `None.` Then mark
    the PR ready for review.
