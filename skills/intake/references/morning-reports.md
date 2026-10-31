# Morning reports

When hq says "Morning reports due" (even "late"), make two delivery reports, yesterday and today so
far. The news digest carries them, so push nothing, even on failure. Post by 08:30 Sydney.

1. Get Sydney dates with `TZ=Australia/Sydney date`, never by hand. Yesterday: yesterday's date, no
   `--until`. Today so far: today's date, until now in UTC.
2. Start one subagent per report, so the Linear pages stay out of your context. Each loads the
   `delivery-report` skill, runs the daily report for its date and follows its Sending it section.
   Give the today-so-far one
   `merged-prs.sh daily <date> --until <now in UTC, such as 2026-10-16T21:30Z>`. Each returns a gist
   link or why it failed.
3. Post both in one line:

   ```bash
   hq news add --topic report --text "Morning reports: yesterday <link>, today so far <link>"
   ```

   Write "failed: <reason>" in place of a failed link.
