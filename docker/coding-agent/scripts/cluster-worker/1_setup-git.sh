#!/bin/bash
# Git setup is optional for cluster workers — skip if no GH_TOKEN

if [ -n "$GH_TOKEN" ]; then
    source /scripts/common/setup-git.sh
fi
