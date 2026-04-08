#!/bin/bash
# Start ttyd on $PORT, calling the provided script on each connection

exec ttyd --writable -p "${PORT}" "$1"
