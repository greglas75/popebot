# Contributing to thepopebot

Thanks for your interest in contributing! We welcome bug fixes, features, docs improvements, and other contributions.

## Getting Started

1. Fork the repository and clone your fork
2. Install dependencies: `npm install`
3. Create a branch from `main` (see naming conventions below)
4. Make your changes
5. Push to your fork and open a pull request

## Branch Naming

Use `type/short-description` format:

- `fix/` — bug fixes
- `feat/` — new features
- `docs/` — documentation changes
- `chore/` — maintenance tasks
- `refactor/` — code restructuring
- `test/` — adding or updating tests

Examples: `fix/cron-scheduler-crash`, `feat/discord-channel`, `docs/deployment-guide`

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type: short description
```

Examples:
- `fix: prevent duplicate cron jobs on restart`
- `feat: add Discord channel adapter`
- `docs: update deployment instructions`

## Pull Request Guidelines

- Use a descriptive title that summarizes the change
- Link to the related issue if one exists (e.g., "Fixes #42")
- Describe what changed and why in the PR body
- Keep PRs focused — one logical change per PR

## Code Standards

- Follow existing patterns in the codebase
- Don't add unnecessary abstractions or over-engineer
- Keep changes minimal and focused on what's needed

## Where Code Goes

Core logic belongs in the **package** (`api/`, `lib/`, `config/`, `bin/`). The `templates/` directory is only for files scaffolded into user projects. See `CLAUDE.md` for the full architecture guide.

## Reporting Issues

Open a [GitHub Issue](../../issues) with:
- A clear description of the problem or suggestion
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Relevant environment details (Node version, OS, etc.)
