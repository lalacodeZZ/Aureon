@echo off
echo [AUREON] Setting up Windows Python FastAPI + LangGraph + Ollama environment...
cd /d %~dp0

if not exist ".venv" (
  python -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

if not exist ".env" (
  copy .env.example .env
)

echo [AUREON] Setup complete. Run: powershell -ExecutionPolicy Bypass -File windows_bundle\run_windows.ps1
