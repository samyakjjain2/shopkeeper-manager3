@echo off
title Sanyam Garments Live Tunnel
echo ====================================================
echo Starting Sanyam Garments Live Tunnel...
echo ====================================================
echo.
echo * Note: Please make sure the local server (Start-Local-Server.bat) is running first!
echo * To STOP the tunnel, simply CLOSE this window.
echo.
ssh -o StrictHostKeyChecking=no -R 80:localhost:3000 nokey@localhost.run
pause
