@echo off
if not exist node_modules (
    call npm install
    if errorlevel 1 (
        echo npm install failed. Please make sure Node.js is installed.
        pause
        exit /b 1
    )
)

echo.
echo Open http://localhost:5173 in Chrome or Edge.
echo.
call npm run dev
pause
