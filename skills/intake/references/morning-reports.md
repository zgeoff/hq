# morning reports

How `intake` runs the morning reports.

When `hq` messages "Morning reports due", have a subagent run `delivery-report`'s daily report for the 2 windows the message names, yesterday (Sydney time) and today so far, with `merged-prs.sh daily <today> --until <the window's UTC end>`. Publish each as a secret gist. By 08:30, add both links in one line with `hq news add --topic report`, and push nothing: the news digest carries them. Name there a failed report and why. Run them even when it says "late".
