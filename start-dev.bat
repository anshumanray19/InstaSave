@echo off
echo ========================================
echo   OmniSave - Development Mode
echo ========================================
echo.
echo Starting both frontend and backend...
echo.
echo Frontend will be at: http://localhost:55964
echo Backend will be at: http://localhost:3001
echo.
echo Press Ctrl+C to stop both servers
echo.

start "OmniSave Frontend" cmd /k "npm run dev"
timeout /t 2 /nobreak > nul
start "OmniSave Backend" cmd /k "npm run backend"

echo.
echo Both servers are starting in separate windows...
echo.
pause
