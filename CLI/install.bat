@echo off
REM GenAI-QA CLI Installation Script for Windows

echo GenAI-QA CLI Installation
echo =========================
echo.

REM Check Python version
python --version
if %ERRORLEVEL% NEQ 0 (
    echo Error: Python is not installed or not in PATH
    exit /b 1
)

REM Check if in CLI directory
if not exist "setup.py" (
    echo Error: setup.py not found. Please run this script from the CLI directory.
    exit /b 1
)

echo.
echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Installing GenAI-QA CLI...
pip install -e .

echo.
echo Installation complete!
echo.
echo Quick start:
echo   1. Login:   genai-qa auth login
echo   2. Help:    genai-qa --help
echo   3. Status:  genai-qa auth status
echo.
