# Post-review list

The owner reviews PRs after they merge. Each list starts where the last ended, so no merge is
missed; never pick a start time yourself. `~/.local/share/z-sessions/stu.md` keeps one line per
list:

```text
POST-REVIEW LIST given at <end time>, covering merges <start time> to <end time>
```

Times are ISO 8601 UTC to the minute, such as `2026-10-16T21:30Z`.

1. Start: the end time on the last such line. With none, ask him where to start.
2. End: now, in UTC, rounded down to the minute.
3. Search, leaving out bot authors such as `app/renovate`:

   ```bash
   gh search prs --owner zgeoff --merged-at "<start time>..<end time>" --limit 200
   gh search prs --owner zgeoff --state open --limit 200
   ```

4. Reply with "Merged" and "Open" headings, one line per PR on what it delivers, URL last. "none"
   under an empty heading.
5. Append this list's line to `stu.md`.
