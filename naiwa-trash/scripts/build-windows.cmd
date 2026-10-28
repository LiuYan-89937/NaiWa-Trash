@echo off
setlocal
cd /d "%~dp0.."
call npm ci
if errorlevel 1 exit /b 1
call npm run package:windows
if errorlevel 1 exit /b 1
echo Installer output: src-tauri\target\release\bundle\nsis
endlocal
