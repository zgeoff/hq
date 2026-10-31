# Hillclimb

Move one number toward a target over many attempts: one code change, one measurement, keep or
revert. These fake a win: one lucky early attempt, a change that wins by failing or by producing
less, and a target lowered to meet it. The steps below guard against each.

1. Settle these before you change anything: the metric, which direction is better, the target, and a
   minimum number of attempts, so one lucky early win can't end the run. Take them from the ticket.
   When the ticket lacks them, send a `decision` note with the values you propose. Carry on with
   them, and switch to the answer's values when it comes.
2. Write one script that measures the metric, and commit it. Don't change it once you start. Make it
   also print an error count and a count of what the program produced, such as requests answered,
   rows written or, for a startup time, commands that ran. A change that wins by failing, or by
   producing less, then shows in those counts. Before you start, make a change on purpose that
   should move the metric, such as a delay for a speed metric, and check that the script sees it.
   Then remove that change.
3. Keep a log of attempts as a Markdown table in your scratch folder. Each row holds the guess, the
   commit or a one-line description of the change, the metric before and after, whether the tests
   pass, and kept or reverted. Read the log before each new attempt.
4. Run the script 5 times on the unchanged code. The median is the baseline. The range, the highest
   result minus the lowest, is the noise. Run the whole test suite, and log the baseline, the noise
   and the test result as row 0.
5. Loop, one guess per attempt. Each guess says why it should help, such as "move the font load off
   the startup path, because it blocks the first paint". For a speed metric, try these kinds of
   guess in order, as the perf playbook does. Each keeps the results the same and does less to
   produce them:
   1. don't do the work;
   2. don't do it twice;
   3. do less;
   4. do it later;
   5. do it at the same time as something else;
   6. do it cheaper.

   For each attempt:
   - Make the code change. Run the script 5 times and the tests, and compare the median with the
     baseline, or with the last kept result once you have one.
   - Keep the change only when the metric moves the better way by more than the noise, every test
     that passed in row 0 still passes, and the error count and the produced count stay the same.
   - When any of these fails, revert every file the attempt touched.
   - Make one commit per kept change. Log the row either way.

6. After 3 reverted attempts in a row, change approach. Try one of:
   - a guess of another kind from the list in step 5;
   - two reverted changes that each moved the metric by less than the noise, combined;
   - a fresh read of the code.
7. Stop when the target and the minimum attempts are both met, or when every guess left would cost
   more than it could gain. Never lower the target to meet it. When you stop short of the target,
   say so in the PR.
8. In the PR description, under "## Verification", give:
   - the metric, the target, the baseline, the final result, and how far it moved, both in its unit
     and in percent;
   - the log, pasted in a `<details>` block;
   - the script's path;
   - the next guess you'd try.
