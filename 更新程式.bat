@echo off
git pull
if errorlevel 1 (
    echo.
    echo git pull failed. Please check the message above.
    pause
    exit /b 1
)

echo.
echo Update complete.
pause
