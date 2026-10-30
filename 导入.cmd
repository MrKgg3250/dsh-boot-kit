@echo off
chcp 65001 >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0导入.ps1"
pause
