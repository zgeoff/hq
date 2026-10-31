# Perf

Make a path a user waits on faster, and prove it with measurements. These fake a speed-up: work that
never ran inside the timed part, a failure that returns fast, and noise between runs. The steps
below guard against each. When the ticket sets a target and a number of attempts, such as "at least
10 tries", use `hillclimb.md` instead.

1. From the ticket, pick the number that matters to the user, such as the time to the first result.
   Measure it before you change anything, with realistic data from the repo's seed or fixtures.
   Drive the path with the repo's benchmark script, such as a `bench` script in `package.json`. When
   the repo has none, use `bun verify`. Keep the output.
2. Check the number before you trust it:
   - Make sure the work happened inside the timed part: rows written, a request answered, a result
     used. Code that never ran takes no time.
   - Count the errors. A run with an error can return faster than a run that succeeds, so throw it
     away, and find the cause.
   - Profile once, outside a timed run, with the runtime's CPU profiler, and log each query's time.
     Note the function or query that takes the most time, for step 5.
3. Try these kinds of fix in order, from the top:
   1. don't do the work at all;
   2. don't do it twice, such as with a cache;
   3. do less of it, such as with a smaller query;
   4. do it later, off the path the user waits on;
   5. do it at the same time as something else;
   6. do it cheaper.

   Aim each fix at the function or query from step 2. Stop when the number meets the ticket's goal,
   such as "under 200 ms". When the ticket sets no goal, try every kind once. When the list runs out
   before the goal, stop, and say in the PR that the goal isn't met.

4. After each fix, check the number as step 2 says, without the profile. Then measure your branch
   before and after the fix, each in its own worktree with the same data. Run each 5 times,
   alternating between the two, so a slow spell on the machine hits both alike. Compare the medians:
   - Take each branch's range: its slowest run minus its fastest.
   - When the difference between the medians is smaller than the larger range, the fix made no
     difference. Revert it.
   - When your branch is slower, revert the fix.

   Then try the next kind of fix.

5. In the PR description, under "## Verification", give the reviewer:
   - a table with a row per path you measured: path, before, after, change in percent, runs, both
     ranges;
   - the slowest function or query before, and the slowest now;
   - each fix you tried, including the ones you reverted: which kind of fix from step 3 it was, the
     change, and its measured effect;
   - the command that reproduces the measurement;
   - the raw runs, in a `<details>` block.
