$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
  Write-Host "[AUREON] Creating virtual environment..."
  python -m venv .venv
}

& .\.venv\Scripts\Activate.ps1

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  Write-Host "[AUREON] Ensuring qwen2.5:3b model is available in Ollama..."
  ollama pull qwen2.5:3b
} else {
  Write-Host "[AUREON] Ollama CLI not found on PATH; deterministic forensic fallback remains active."
}

Write-Host "[AUREON] Starting FastAPI server on http://127.0.0.1:8000 ..."
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
