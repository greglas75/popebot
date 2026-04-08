#!/bin/bash
# Clone repo if workspace is empty, otherwise respect existing state (persisted volume)

mkdir -p /home/coding-agent/workspace
cd /home/coding-agent/workspace

if [ ! -d ".git" ]; then
    git clone --branch "$BRANCH" "https://github.com/$REPO" .
    export JUST_CLONED=1
fi
