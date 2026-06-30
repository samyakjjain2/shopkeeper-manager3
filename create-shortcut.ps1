$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')

# Shortcut 1: Open Website in Browser
$WebShortcut = $WshShell.CreateShortcut("$Desktop\Sanyam Garments - Website.lnk")
$WebShortcut.TargetPath = "http://localhost:3000"
$WebShortcut.Description = "Sanyam Garments Showroom Manager"
$WebShortcut.Save()

# Shortcut 2: Start Server (if not running)
$ServerShortcut = $WshShell.CreateShortcut("$Desktop\Sanyam Garments - Start Server.lnk")
$ServerShortcut.TargetPath = "powershell.exe"
$ServerShortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"c:\samyak c++\showroom-manager\server.ps1`""
$ServerShortcut.WorkingDirectory = "c:\samyak c++\showroom-manager"
$ServerShortcut.Description = "Start Sanyam Garments Server"
$ServerShortcut.WindowStyle = 7
$ServerShortcut.Save()

Write-Host "Done! Desktop shortcuts created:" -ForegroundColor Green
Write-Host "  1. 'Sanyam Garments - Website'       (browser mein kholta hai)" -ForegroundColor Yellow
Write-Host "  2. 'Sanyam Garments - Start Server'  (server start karta hai)" -ForegroundColor Yellow
