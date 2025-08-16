#!/usr/bin/env bash

FRONT_PORT=8080
BACK_PORT=3001

start() {
  echo "🚀 Starting Phoenix dev environment..."

  # Start frontend
  cd frontend
  if [ ! -d node_modules ]; then
    echo "📦 Installing frontend deps..."
    npm install --save-dev serve
  fi
  if lsof -i :$FRONT_PORT | grep LISTEN >/dev/null 2>&1; then
    echo "✅ Frontend already running at http://localhost:$FRONT_PORT"
  else
    echo "▶️ Starting frontend on :$FRONT_PORT"
    npx serve . -l $FRONT_PORT > ../frontend.log 2>&1 &
    echo $! > ../.frontend.pid
  fi
  cd ..

  # Start backend
  cd backend
  if [ ! -d node_modules ]; then
    echo "📦 Installing backend deps..."
    npm install
  fi
  if lsof -i :$BACK_PORT | grep LISTEN >/dev/null 2>&1; then
    echo "✅ Backend already running at http://localhost:$BACK_PORT"
  else
    echo "▶️ Starting backend on :$BACK_PORT"
    node server.js > ../backend.log 2>&1 &
    echo $! > ../.backend.pid
  fi
  cd ..
}

stop() {
  echo "🛑 Stopping Phoenix dev environment..."
  
  # Stop frontend
  if [ -f .frontend.pid ]; then
    kill "$(cat .frontend.pid)" 2>/dev/null || pkill -f "serve . -l $FRONT_PORT"
    rm -f .frontend.pid
    echo "✅ Frontend stopped"
  else
    pkill -f "serve . -l $FRONT_PORT" && echo "✅ Frontend stopped (fallback)" || echo "❌ Frontend not running"
  fi

  # Stop backend
  if [ -f .backend.pid ]; then
    kill "$(cat .backend.pid)" 2>/dev/null || pkill -f "node server.js"
    rm -f .backend.pid
    echo "✅ Backend stopped"
  else
    pkill -f "node server.js" && echo "✅ Backend stopped (fallback)" || echo "❌ Backend not running"
  fi
}

restart() {
  stop
  sleep 1
  start
}

status() {
  echo "📡 Process status:"
  if [ -f .frontend.pid ] && ps -p "$(cat .frontend.pid)" >/dev/null 2>&1; then
    echo "  ✔️ Frontend running (PID $(cat .frontend.pid))"
  elif pgrep -f "serve . -l $FRONT_PORT" >/dev/null; then
    echo "  ✔️ Frontend running (detected via pgrep)"
  else
    echo "  ❌ Frontend not running"
  fi

  if [ -f .backend.pid ] && ps -p "$(cat .backend.pid)" >/dev/null 2>&1; then
    echo "  ✔️ Backend running (PID $(cat .backend.pid))"
  elif pgrep -f "node server.js" >/dev/null; then
    echo "  ✔️ Backend running (detected via pgrep)"
  else
    echo "  ❌ Backend not running"
  fi
}

case "$1" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status ;;
  *) echo "Usage: $0 {start|stop|restart|status}" ;;
esac
