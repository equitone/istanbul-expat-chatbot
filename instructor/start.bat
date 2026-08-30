@echo off
REM Instructor Workbench — double-click this file to start.
REM Runs the PowerShell server with a bypassed execution policy for this one
REM process only, so Windows' default script restrictions do not block it and
REM nothing about the machine's settings is changed.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
