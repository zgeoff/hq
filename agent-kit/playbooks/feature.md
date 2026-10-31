# Feature

Build the feature, and prove it works the way a user would use it. `bun verify` drives a feature as
a user would; the feature map in the repo's `verify-<app>` skill lists each feature with its command
and the end state that proves it.

1. When the ticket has a Design block, build what it decides. Otherwise build from the ticket's
   description. When you find that the block is wrong, send a `decision` note. Then build the parts
   the fault doesn't affect, and push them in a draft PR. End your turn there, and wait for the
   answer.
2. Define the types before you write logic. Prefer a state machine to a set of booleans, and a table
   to a chain of if/else: the next agent can see every state and every case in one place. When the
   change crosses a module boundary, also write the function signatures and the code that calls them
   before any function body. You then see whether the interface works before you spend time on its
   insides.
3. Build in small steps. Write a test for each step. Commit the step once its tests pass.
4. When users can reach the feature, give it an entry in the feature map, in the same PR. Copy the
   form of the nearest entry:
   - what the feature is;
   - how a user reaches it;
   - the `bun verify` command that drives it, or, when `bun verify` can't, how to see its effect,
     such as the record it writes;
   - the end state that proves it works.

   When the change alters a feature in the map, update its entry.

5. Drive the feature with `bun verify`. It passes when it shows the end state the ticket's
   Acceptance names. When `bun verify` can't drive the feature, such as a background job, show its
   effect another way, such as the record it writes.
6. In the PR description, under "## Verification", give the command from step 5, and the lines of
   its output that show the end state, in a code block.
