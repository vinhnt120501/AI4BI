#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
# Backend
source "$DIR/backend/venv/bin/activate"
cd "$DIR/backend" && python api.py --serve &
BACK_PID=$!

# Frontend
cd "$DIR/frontend" && npm run dev &
FRONT_PID=$!

echo "Backend  PID=$BACK_PID  → http://localhost:8005"
echo "Frontend PID=$FRONT_PID → http://localhost:3000"
echo "Ctrl+C to stop"

trap "kill $BACK_PID $FRONT_PID 2>/dev/null" EXIT
wait
