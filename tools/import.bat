@echo off
rem Import an ae2ec export into EffectCraft (headless, writes a .ecproj next to it).
rem Drag the .ae2ec.json onto this file, or run:  import.bat "C:\path\project.ae2ec.json" [-Live]
setlocal
set "JSON=%~1"
if "%JSON%"=="" set /p "JSON=Path to the .ae2ec.json file: "
if "%JSON%"=="" exit /b 1
set "JSON=%JSON:"=%"
shift
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0import.ps1" -Json "%JSON%" %1 %2 %3 %4 %5 %6
pause
