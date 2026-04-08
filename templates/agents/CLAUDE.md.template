# agents/ — Custom Agent Definitions

## Adding an Agent

Each subdirectory defines an agent. Create a folder with a `SYSTEM.md` file:

```
agents/
└── my-agent/
    └── SYSTEM.md        # System prompt — identity, instructions, constraints
```

`SYSTEM.md` is the agent's system prompt. Write it in markdown addressed to the agent (e.g. "You are a code reviewer...").

For agents with multiple complex tasks, add a `jobs/` subfolder:

```
agents/
└── my-agent/
    ├── SYSTEM.md
    └── jobs/
        ├── weekly-report.md
        └── cleanup.md
```

## Scheduling

Add a cron entry in `agent-job/CRONS.json`:

```json
{
  "name": "my-agent-daily",
  "schedule": "0 9 * * *",
  "type": "agent",
  "job": "Read agents/my-agent/SYSTEM.md and follow the instructions there.",
  "enabled": true
}
```

For job-specific prompts, chain the reads:

```json
{
  "name": "my-agent-report",
  "schedule": "0 9 * * 1",
  "type": "agent",
  "job": "Read agents/my-agent/SYSTEM.md for context, then read agents/my-agent/prompts/weekly-report.md and complete that task.",
  "enabled": true
}
```

## Removing an Agent

Delete the `agents/<name>/` folder and remove its cron entries from `agent-job/CRONS.json`.
