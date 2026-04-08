#!/bin/bash
set -e

echo "=== Pushing to GitHub ==="
cd /Users/greglas/DEV/thepopebot
git add -A
git commit -m "${1:-update}" || echo "Nothing to commit"
git push myfork clean-main:main

echo "=== Rebuilding on VPS ==="
ssh vps /root/rebuild.sh

echo "=== Deploy complete ==="
