@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Defaults
set "PORT=3800"

REM -----------------------------
REM Argument parsing (robust)
REM Supports:
REM   -p 3800   /p 3800
REM   -p=3800   -p:3800   /p:3800
REM   -p4251    /p4251
REM   --port 4251   --port=4251   --port:4251
REM Notes for PowerShell users: if PS tries to interpret switches, you can use:
REM   ./kill-app.cmd --% -p 4251
REM -----------------------------
:parse_args
if "%~1"=="" goto args_done
set "arg=%~1"
set "next=%~2"

REM Case 1: exact -p or /p with separate value
if /I "!arg!"=="-p" (
  if "%~2"=="" goto :usage
  set "PORT=%~2"
  shift & shift
  goto :parse_args
)
if /I "!arg!"=="/p" (
  if "%~2"=="" goto :usage
  set "PORT=%~2"
  shift & shift
  goto :parse_args
)

REM Case 2: long name --port
if /I "!arg!"=="--port" (
  if "%~2"=="" goto :usage
  set "PORT=%~2"
  shift & shift
  goto :parse_args
)

REM Case 3: forms with = or :  (e.g., -p=4251, -p:4251, /p:4251, --port=4251)
for /f "tokens=1,2 delims==:" %%A in ("!arg!") do (
  set "k=%%~A"
  set "v=%%~B"
)
if defined v (
  if /I "!k!"=="-p"  ( set "PORT=!v!" & shift & goto :parse_args )
  if /I "!k!"=="/p"  ( set "PORT=!v!" & shift & goto :parse_args )
  if /I "!k!"=="--port" ( set "PORT=!v!" & shift & goto :parse_args )
)

REM Case 4: compact forms -p4251 or /p4251
if /I "!arg:~0,2!"=="-p" (
  set "PORT=!arg:~2!"
  if not defined PORT goto :usage
  shift
  goto :parse_args
)
if /I "!arg:~0,2!"=="/p" (
  set "PORT=!arg:~2!"
  if not defined PORT goto :usage
  shift
  goto :parse_args
)

REM Unknown option
if "!arg:~0,1!"=="-" (
  echo Unknown option: %~1
  goto :usage
)

REM Ignore non-switch arg and continue (allows accidental extra args)
shift
goto :parse_args

:args_done

REM Validate port is numeric and in range 1..65535
call :validate_port "%PORT%"
if errorlevel 1 goto :bad_port

echo Checking for processes using port %PORT%...

REM Show matching netstat lines first
netstat -aon | findstr ":%PORT%" | findstr /R /C:"LISTENING\|ESTABLISHED" >nul 2>nul
netstat -aon | findstr ":%PORT%"

set "FOUND="
set "SEEN=,"

for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":%PORT%"') do (
  echo Found candidate PID: %%P
  echo !SEEN! | findstr /C:",%%P," >nul
  if errorlevel 1 (
    set "SEEN=!SEEN!%%P,"
    set "FOUND=1"
    echo Attempting to kill PID %%P...
    taskkill /F /PID %%P
    if errorlevel 1 (
      echo Failed to kill PID %%P. You may need to run this script as Administrator or the process may have already exited.
    ) else (
      echo Successfully killed PID %%P.
    )
  ) else (
    REM Skip duplicate PID
  )
)

if not defined FOUND (
  echo No process found using port %PORT%.
)

goto :end

:validate_port
set "_n=%~1"
REM ensure only digits
for /f "delims=0123456789" %%D in ("%~1") do (
  if not "%%D"=="" exit /b 1
)
if "%~1"=="" exit /b 1
set /a _chk=%~1 >nul 2>&1
if errorlevel 1 exit /b 1
if %~1 LSS 1 exit /b 1
if %~1 GTR 65535 exit /b 1
exit /b 0

:bad_port
echo Invalid port: "%PORT%". Must be an integer between 1 and 65535.
echo.
goto :usage

:usage
echo Usage: %~n0 -p PORT
echo.
echo Examples:
echo   %~n0
echo   %~n0 -p 5000
echo   %~n0 /p 5000
echo   %~n0 -p=5000
echo   %~n0 -p:5000
echo   %~n0 --port 5000
if exist NUL rem no-op
exit /b 1

:end
endlocal
