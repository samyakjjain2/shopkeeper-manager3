@echo off
title Sanyam Garments Database Setup
echo ====================================================
echo Installing server dependencies (npm install)...
echo ====================================================
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install failed. Make sure Node.js is installed correctly.
    pause
    exit /b
)
echo.
echo ====================================================
echo Creating database tables in Neon DB (prisma db push)...
echo ====================================================
echo.
call npx prisma db push
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Database push failed. Check your connection string in the .env file.
    pause
    exit /b
)
echo.
echo ====================================================
echo Database setup completed successfully!
echo You can now close this window and run the app.
echo ====================================================
pause
