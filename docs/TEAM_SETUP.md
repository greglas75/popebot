# Team Setup

## Adding users

1. Go to **Admin → Users**
2. Add email + password for each team member
3. They log in at https://coding.tgmedit.com

Default role for new users is `user` (not admin). Promote to admin in the admin panel if needed.

## Authentication: OAuth tokens (Claude Max)

Each team member with a Claude Max subscription can contribute their OAuth token:

1. On their local machine: `claude setup-token`
2. Copy the token (starts with `sk-ant-oat01-...`)
3. Admin adds it in **Admin → Event Handler → Coding Agents → Claude Code**

### Multi-token rotation

Multiple tokens can be added. The system uses LRU (least-recently-used) rotation — each container picks the token that hasn't been used the longest. This distributes usage across subscription accounts.

## Chat LLM

Chat (web UI conversation) requires a separate API key. Options:

| Provider | Cost | Setup |
|----------|------|-------|
| Mistral | Free tier available | Admin → LLMs → Mistral API Key |
| Google Gemini | Free tier (generous) | Admin → LLMs → Google API Key |
| Anthropic | Paid per token | Admin → LLMs → Anthropic API Key |

Chat LLM is independent from coding agent LLM. Use a cheap/free model for chat, keep Claude Max for agent jobs.

## What each user can do

| Role | Chat | Agent Jobs | Code Workspaces | Admin |
|------|------|------------|-----------------|-------|
| user | Yes | Yes | Yes | No |
| admin | Yes | Yes | Yes | Yes |

## Working with repositories

Each user can select any repository visible to the GitHub PAT configured during setup. To add access to more repos:

1. **Admin → GitHub → Tokens** — check PAT scope
2. If PAT is scoped to specific repos, update it at github.com/settings/personal-access-tokens

For team use, the PAT should have **All repositories** access.

## Cost management

- **Agent jobs:** Use OAuth tokens from Max subscriptions (included in subscription, no per-token cost)
- **Chat:** Use free tier Mistral or Gemini
- **Opus model:** Included in Max, but consumes more of the subscription quota
- **Sonnet (1M context):** Extra billing at $3/$15 per Mtok — avoid unless needed

## Monitoring

- **Containers page:** See running agent containers, CPU/memory usage
- **Notifications:** Get alerts when agent jobs complete
- **GitHub:** All agent work is visible as branches and PRs
