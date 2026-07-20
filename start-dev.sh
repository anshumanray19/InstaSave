#!/bin/bash

echo "========================================"
echo "  OmniSave - Development Mode"
echo "========================================"
echo ""
echo "Starting both frontend and backend..."
echo ""
echo "Frontend will be at: http://localhost:55964"
echo "Backend will be at: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $FRONTEND_PID $BACKEND_PID 2>/dev/null
    exit
}

# Set up trap to catch SIGINT (Ctrl+C)
trap cleanup SIGINT SIGTERM

# Start frontend
npm run dev &
FRONTEND_PID=$!

# Wait a bit for frontend to start
sleep 2

# Start backend
npm run backend &
BACKEND_PID=$!

echo ""
echo "✓ Frontend running (PID: $FRONTEND_PID)"
echo "✓ Backend running (PID: $BACKEND_PID)"
echo ""
echo "Logs from both servers will appear below:"
echo "=========================================="
echo ""

# Wait for both processes
wait
