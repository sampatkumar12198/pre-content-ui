@echo off
REM Run the Content Review Panel using the project-local venv (no PATH/interpreter guesswork).
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [setup] creating virtual environment...
  python -m venv .venv || goto :err
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\python.exe -m pip install -r requirements.txt || goto :err
)

echo [run] http://localhost:8000  (Ctrl+C to stop)
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
goto :eof

:err
echo.
echo Setup failed. Make sure Python 3.10+ is installed and on PATH.
pause
