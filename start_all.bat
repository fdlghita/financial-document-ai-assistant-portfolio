@echo off
title Financial Document AI Assistant - Startup
echo === Financial Document AI Assistant Startup ===
echo.

set ROOT=%~dp0
set LLAMA_SERVER=%LOCALAPPDATA%\Microsoft\WinGet\Packages\ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe\llama-server.exe
set MODEL=%ROOT%models\Qwen2.5-3B-Instruct-Q4_K_M.gguf

echo [1/3] Starting llama.cpp server on port 8080...
if exist "%MODEL%" (
    start "llama-server :8080" cmd /k ""%LLAMA_SERVER%" -m "%MODEL%" --port 8080 -c 4096 -n 1024 --threads 8 --host 127.0.0.1"
    timeout /t 5 /nobreak >nul
) else (
    echo [WARN] Model not found: %MODEL%
)

echo [2/3] Starting FastAPI backend on port 8000...
start "backend :8000" cmd /k "cd /d "%ROOT%backend" && "%ROOT%.venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000"

timeout /t 3 /nobreak >nul

echo [3/3] Starting React frontend on port 3000...
start "frontend :3000" cmd /k "cd /d "%ROOT%frontend" && npm start"

echo.
echo Services launched on localhost only:
echo   llama.cpp : http://localhost:8080
echo   Backend   : http://localhost:8000
echo   Frontend  : http://localhost:3000
echo.
pause