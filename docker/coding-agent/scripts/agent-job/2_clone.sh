#!/bin/bash
# Clone the agent-job branch (shallow, single-branch)

mkdir -p /home/coding-agent/workspace
cd /home/coding-agent/workspace

if [ ! -d ".git" ]; then
    git clone --single-branch --branch "$BRANCH" --depth 1 "https://github.com/$REPO" .
fi
