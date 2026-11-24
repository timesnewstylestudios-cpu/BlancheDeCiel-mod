#!/bin/sh
# Installs coturn on Debian, Ubuntu or Termux and prints the next manual step.
# A public UDP port is required. A Cloudflare Worker cannot open that port.
set -eu
if command -v pkg >/dev/null 2>&1; then
  pkg install -y coturn
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y coturn
else
  echo "Install coturn with your package manager, then copy turn/turnserver.conf." >&2
  exit 1
fi
echo "Set static-auth-secret in turn/turnserver.conf to the same value as the Worker secret TURN_SECRET."
echo "Set external-ip to this machine's public address. Open UDP 3478."
echo "Start: turnserver -c $(pwd)/turnserver.conf"
