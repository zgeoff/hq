# Bug fix

Find the cause of the bug, fix it, and prove the fix with a run. The code you suspect first may not
be the cause, and a guard where the bad value is read hides the bug.

A reproduction is a command whose output shows the bug. Use the first of these that reaches it:

- `bun verify`, the repo's script that drives a feature the way a user would and prints what
  happened;
- a command that runs the app or calls the endpoint;
- a failing test.

1. Read the code around the bug. Reproduce every bug from a live incident or a user report, and
   every bug whose cause the code doesn't show. Skip the reproduction only when the code shows the
   defect plainly, such as a wrong value, an inverted condition or a typo.
2. Run the reproduction, and keep its output for the PR. Expect the output to show the bug.
3. Find the cause. Test each guess with a run, such as a focused test or a throwaway script, one
   guess at a time. When you don't know how the code works, use the `how` skill. Before you remove
   code you don't understand, use the `why` skill.
4. Fix the cause. When the bug is a value or a record that should never exist, such as an order with
   no customer, fix the code that creates it, and list the bad records already stored in the PR.
5. Search the repo for the faulty expression or call. In this PR, fix each match that has the same
   defect: a copy of the bug left elsewhere is the next bug report.
6. Add a test that fails without the fix and passes with it. When the reproduction is a failing
   test, it can be this test. To check it, stash the source files you changed, but not the test. Run
   the test, and restore the files. Expect a failure message that shows the bug, not a setup or
   import error.
7. When you reproduced the bug, run the reproduction again. Keep the passing output.
8. In the PR description, under "## Verification":
   - with a reproduction, give its command, its output before the fix and after, and the test's
     name;
   - without one, give the test's name, its failing and passing output, and one line:
     `No reproduction: <why the code alone shows the defect>`.

   Under "## Fixed on the way", list each other match you fixed, or write `None.`
