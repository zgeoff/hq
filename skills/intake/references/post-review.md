# post-review list

How `intake` sends the post-review list. Send it when the owner asks for the PRs to review, or for a post-merge review.

1. Read the last "POST-REVIEW LIST given at" line in your saved state, and use its `<to>` time as `<from>`. If there's no such line, ask the owner where the list starts. Never pick a start time yourself.
2. Take `<to>` as the UTC time you search, and list every PR merged after `<from>` and up to `<to>`, then every PR open at `<to>`. Leave out bot PRs.
3. Write one line per PR on what it delivers, with its URL at the end of the line.
4. After you send it, save the line "POST-REVIEW LIST given at <UTC time>, covering merges <from> to <to>".
