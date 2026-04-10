#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill any stuck processes on our ports
lsof -i :8333 -t 2>/dev/null | xargs kill -9 2>/dev/null
lsof -i :3333 -t 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# Backend (subshell to isolate cd)
(
  source "$DIR/backend/venv/bin/activate"
  cd "$DIR/backend"
  python api.py --serve
) &
BACK_PID=$!

# Frontend (subshell to isolate cd)
(
  cd "$DIR/frontend"
  npm run dev -- -p 3333
) &
FRONT_PID=$!

echo "Backend  PID=$BACK_PID  → http://localhost:8333"
echo "Frontend PID=$FRONT_PID → http://localhost:3333"
echo "Ctrl+C to stop"

trap "kill $BACK_PID $FRONT_PID 2>/dev/null; lsof -i :8333 -t 2>/dev/null | xargs kill -9 2>/dev/null; lsof -i :3333 -t 2>/dev/null | xargs kill -9 2>/dev/null" EXIT
wait
