@echo off
setlocal

set MODEL_PATH=%~dp0models\Qwen2.5-3B-Instruct-Q4_K_M.gguf
set LLAMA_SERVER=%LOCALAPPDATA%\Microsoft\WinGet\Packages\ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe\llama-server.exe

if not exist "%MODEL_PATH%" (
    echo ERROR: Model not found at %MODEL_PATH%
    echo Run: python download_model.py
    pause
    exit /b 1
)

echo Starting llama.cpp server on port 8080...
echo Model: %MODEL_PATH%
echo.
"%LLAMA_SERVER%" -m "%MODEL_PATH%" --port 8080 -c 4096 -n 1024 --threads 8 --host 127.0.0.1
