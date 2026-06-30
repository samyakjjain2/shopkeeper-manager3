@echo off
:: Create Windows startup task for Sanyam Garments Server
schtasks /create /tn "SanyamGarments-Server" /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File \"c:\samyak c++\showroom-manager\server.ps1\"" /sc ONLOGON /rl HIGHEST /f
if %errorlevel% == 0 (
    echo.
    echo  SUCCESS! Server ab Windows start hone par automatically chalega.
    echo  Aapko dobara kuch nahi karna padega!
) else (
    echo.
    echo  ERROR: Task create nahi hua.
)
pause
