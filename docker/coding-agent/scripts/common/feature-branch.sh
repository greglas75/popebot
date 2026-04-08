#!/bin/bash
# Create or checkout feature branch — skipped if no FEATURE_BRANCH provided

if [ -z "$FEATURE_BRANCH" ]; then
    return 0
fi

# Persisted volume — branch already exists, do nothing
if git rev-parse --verify "$FEATURE_BRANCH" >/dev/null 2>&1; then
    return 0
fi

# Fresh clone — create and track
if git ls-remote --heads origin "$FEATURE_BRANCH" | grep -q .; then
    git checkout -B "$FEATURE_BRANCH" "origin/$FEATURE_BRANCH"
else
    git checkout -b "$FEATURE_BRANCH"
    git push -u origin "$FEATURE_BRANCH"
fi
