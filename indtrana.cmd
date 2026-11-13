@echo off
rem IndTrana one-step control for Windows: a thin wrapper around aegis.cmd (same commands and options).
call "%~dp0aegis.cmd" %*
exit /b %ERRORLEVEL%
