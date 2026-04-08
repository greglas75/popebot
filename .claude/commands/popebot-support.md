---
allowed-tools: Bash
description: Redirect support requests on GitHub issues to the Skool community
---

Redirect a GitHub issue that is a support request (not a bug or feature request) to the community. Post a comment and close the issue.

The issue number is: $ARGUMENTS

## Step 1 — Fetch the issue author

Run `gh issue view $ARGUMENTS --json author --jq .author.login` to get the author's username.

## Step 2 — Post a redirect comment

Use `gh issue comment $ARGUMENTS --body "<message>"` to post the following comment, replacing `{author}` with the username from Step 1:

```
@{author} thanks for submitting and contributing your time to the project! We can only support bugs or feature requests in the issue queue.

For support, please join the community — we'd love to help you there:
👉 https://www.skool.com/ai-architects

If you believe this is a bug, please feel free to open a new issue and include:
1. **thepopebot version** (`npm list thepopebot`)
2. **Platform** (macOS, Linux, Windows)
3. **What happened** vs **what you expected**
4. **Steps to reproduce**

Much respect 🫡
```

## Step 3 — Close the issue

Run `gh issue close $ARGUMENTS --reason "not planned"` to close it.

## Important

- Always fetch the issue first to get the real author username — never guess.
- Post the comment before closing so the author gets notified.
- If any `gh` command fails, stop and report the error to the user.
