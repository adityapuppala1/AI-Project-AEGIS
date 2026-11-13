@echo off
rem IndTrana one-step control for Windows. Double-click for a menu, or run: aegis.cmd install|start|stop|status|doctor|help
setlocal
set "AEGIS_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%AEGIS_PS%" set "AEGIS_PS=powershell.exe"
if not "%~1"=="" goto run
echo.
echo   IndTrana (local synthetic exercise)
echo   1  Install (first time)
echo   2  Start
echo   3  Stop
echo   4  Status
echo   5  Doctor (find and fix problems)
echo.
set "AEGIS_CHOICE="
set /p AEGIS_CHOICE=Choose 1-5: 
set "AEGIS_CMD="
if "%AEGIS_CHOICE%"=="1" set "AEGIS_CMD=install"
if "%AEGIS_CHOICE%"=="2" set "AEGIS_CMD=start"
if "%AEGIS_CHOICE%"=="3" set "AEGIS_CMD=stop"
if "%AEGIS_CHOICE%"=="4" set "AEGIS_CMD=status"
if "%AEGIS_CHOICE%"=="5" set "AEGIS_CMD=doctor"
if not defined AEGIS_CMD ( echo No valid choice. & pause & exit /b 2 )
"%AEGIS_PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\aegis.ps1" %AEGIS_CMD%
set "AEGIS_EXIT=%ERRORLEVEL%"
pause
exit /b %AEGIS_EXIT%
:run
"%AEGIS_PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\aegis.ps1" %*
exit /b %ERRORLEVEL%
