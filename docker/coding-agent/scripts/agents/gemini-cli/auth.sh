#!/bin/bash
# Gemini CLI auth — export GOOGLE_API_KEY as GEMINI_API_KEY
if [ -n "$GOOGLE_API_KEY" ]; then
    export GEMINI_API_KEY="$GOOGLE_API_KEY"
fi
