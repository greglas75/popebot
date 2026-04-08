---
description: Analyze CLAUDE.md files against best practices and produce an optimization plan
---

Enter plan mode first. Do NOT edit any files — this command only produces an analysis and a todo list. The user will decide what to implement.

Follow these steps IN ORDER. The sequence matters — you must understand what's changed in the codebase before you can judge what the CLAUDE.md files should contain.

## Step 1 — Discover all CLAUDE.md files and their ages

Find every `CLAUDE.md` file in the project. For each one, read its full contents and use git to find when it was last modified.

**Special case — `templates/`**: This directory should only have two CLAUDE.md-related files. `templates/CLAUDE.md` guides Claude when working on template files in this package's source code. `templates/CLAUDE.md.template` (or similar `.template` extension) gets scaffolded into end-user projects and should be designed for a Claude session working inside their project, not this repo. Flag any other CLAUDE.md files in the templates tree as unnecessary.

## Step 2 — Detect codebase changes and identify gaps

This is the most important step. For each CLAUDE.md file, use git to figure out what code has changed in its relevant scope since it was last modified. The goal is a clear picture of what's new, changed, or removed.

**What to look for:**
- New directories, modules, API routes, server actions, or endpoints not documented anywhere
- Changed or new `package.json` exports that affect how code is imported
- Schema changes (new tables, columns, relationships)
- Architectural shifts (new patterns, deprecated approaches, refactored modules)
- Deleted or moved files that are still referenced in CLAUDE.md
- New patterns or conventions that Claude would get wrong without guidance

For each gap, apply the litmus test: "Would Claude make mistakes without knowing this?" If yes, it's high priority.

## Step 3 — Audit existing content against best practices

NOW evaluate each CLAUDE.md for quality — informed by what you learned in Step 2.

### Root CLAUDE.md

**Size budget**: under 200 lines. Count current lines and flag if over budget.

**The litmus test**: for every section ask "Would removing this cause Claude to make mistakes?" If not, flag for removal. If content only matters when working in a specific subdirectory, move it to that subdirectory's CLAUDE.md so it lazy-loads instead of consuming tokens every session.

### Subfolder CLAUDE.md files

For each, evaluate: Is it scoped correctly? Does it duplicate the root? Is it stale? Should it exist at all?

## Step 4 — Scan for directories that need a new CLAUDE.md

Actively explore the codebase to find uncovered areas. Do not guess — actually look. Browse directories that have no CLAUDE.md, read their key files, and apply the same litmus test: would Claude make mistakes working here without a CLAUDE.md?

## Step 5 — Produce the optimization plan

Create a structured todo list ordered by priority, not by file. For each item, be specific about what to change and why. Summarize the overall impact at the end.

If there are $ARGUMENTS, treat them as additional focus areas or constraints for the analysis.
