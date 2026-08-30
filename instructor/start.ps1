# Serve the workbench on Windows.  Usage:  .\start.ps1 [port]
param([int]$Port = 8099)
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Origin = "http://localhost:$Port"

Write-Host ""
Write-Host "  Instructor Workbench" -ForegroundColor Cyan
Write-Host "  App:     $Origin"
Write-Host "  Serving: $Dir"
Write-Host ""
Write-Host "  For AI review with a local model, in a SECOND PowerShell window:"
Write-Host "    `$env:OLLAMA_ORIGINS='$Origin'; `$env:OLLAMA_CONTEXT_LENGTH='32768'; ollama serve"
Write-Host "    ollama pull qwen2.5:14b"
Write-Host ""
Write-Host "  Then: Settings -> AI review -> Local -> Ollama -> context 32768 -> Test connection."
Write-Host ""

Set-Location $Dir
python -m http.server $Port
