@echo off
title Sanyam Garments - Starting...
color 0A

:: Auto-elevate to Administrator if not already running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  Admin rights chahiye... UAC prompt aayega.
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo.
echo  ============================================
echo    SANYAM GARMENTS - Showroom Manager
echo  ============================================
echo.
echo  [1/3] Server start ho raha hai...

:: Start PowerShell server in background (hidden window)
start "" /min node "c:\samyak c++\showroom-manager\server.js"

echo  [2/3] 3 second wait kar raha hai...
timeout /t 3 /nobreak >nul

echo  [3/3] Chrome mein website khul rahi hai...

:: Try to open in Chrome first, then Edge, then default browser
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
set CHROME2="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

if exist %CHROME% (
    start "" %CHROME% "http://localhost:3000"
) else if exist %CHROME2% (
    start "" %CHROME2% "http://localhost:3000"
) else if exist %EDGE% (
    start "" %EDGE% "http://localhost:3000"
) else (
    start "" "http://localhost:3000"
)

echo.
echo  ============================================
echo   Website khul gayi hai! :)
echo   Address: http://localhost:3000
echo.
echo   Is window ko BAND mat karo!
echo   Band karne par website bhi band ho jayegi.
echo  ============================================
echo.

:: Keep window open (server runs in hidden window, this shows status)
echo  Server chal raha hai... (Band karne ke liye ye window close karo)
echo.
pause >nul
