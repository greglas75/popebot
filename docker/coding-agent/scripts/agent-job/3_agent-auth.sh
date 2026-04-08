#!/bin/bash
set -e
trap 'echo "ERROR: Script failed: $BASH_SOURCE (line $LINENO)" >&2' ERR
source /scripts/agents/${AGENT}/auth.sh
