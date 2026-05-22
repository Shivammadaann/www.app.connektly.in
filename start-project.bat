@echo off
cd /d "%~dp0"

start "API Terminal" cmd /k "npm install && npm run build && npm run dev:api"

timeout /t 5 /nobreak >nul

start "Client Terminal" cmd /k "cd /d %~dp0 && npm run dev:client"