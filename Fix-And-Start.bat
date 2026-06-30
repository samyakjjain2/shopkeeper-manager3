@echo off
title Sanyam Garments - Fix and Start

:: Check if already admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Admin access for one-time fix...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo  [1/3] Server dependencies check...
 
echo.
echo  [2/3] Server start ho raha hai...
start "" /min node "c:\samyak c++\showroom-manager\server.js"

echo  [3/3] 3 second ruko...
timeout /t 3 /nobreak >nul

echo.
echo  Website khul rahi hai...
start "" "http://localhost:3000"

echo.
echo  ============================================
echo    Server chal raha hai!
echo    http://localhost:3000
echo.
echo    Ab "Sanyam-Garments-Kholo.bat" use karo
echo    har baar website kholne ke liye.
echo  ============================================
echo.
pause
