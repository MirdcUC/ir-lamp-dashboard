@echo off
call npm install
if errorlevel 1 (
    echo npm install failed. Please make sure Node.js is installed.
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo build failed.
    pause
    exit /b 1
)

echo.
echo Open http://localhost:4173 in Chrome or Edge.
echo.
call npm run preview
pause
