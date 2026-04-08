#!/bin/bash
# Pi auth — no-op. Pi reads API keys directly from env vars:
#   ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, CUSTOM_API_KEY
# The caller passes whichever key matches the provider. Nothing to swap or unset.
