#!/bin/bash
# OpenCode auth — no-op. OpenCode reads API keys directly from env vars:
#   ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, etc.
# The caller passes whichever key matches the provider. Nothing to swap or unset.
