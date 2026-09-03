<#
  Instructor Workbench — self-contained local server for Windows.

  Uses .NET's HttpListener, which ships with Windows, so nothing has to be
  installed: no Python, no Node. Binding to "localhost" specifically (rather
  than "+" or "*") is what keeps it working without administrator rights.

  The app cannot be opened by double-clicking index.html, because browsers
  refuse to load ES modules over file://. Hence a server.

  Usage:  .\start.ps1  [-Port 8099]
#>
param([int]$Port = 8099)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Origin = "http://localhost:$Port"

# Content types matter: a browser will refuse to run a module served as
# text/plain, and the whole app is ES modules.
$Mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.wasm' = 'application/wasm'
  '.pdf'  = 'application/pdf'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("$Origin/")
try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "  Could not open port $Port." -ForegroundColor Red
  Write-Host "  Another program is probably using it. Try a different one:" -ForegroundColor Red
  Write-Host "      .\start.ps1 -Port 8100" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Note: your saved data is tied to the address, so if you have" -ForegroundColor Yellow
  Write-Host "  already been using $Origin, keep using that port or your" -ForegroundColor Yellow
  Write-Host "  grades will appear to be missing. Export a backup first." -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "  Instructor Workbench" -ForegroundColor Cyan
Write-Host "  ------------------------------------------------------------"
Write-Host "  Open:    $Origin"
Write-Host "  Folder:  $Root"
Write-Host ""
Write-Host "  Everything runs on this computer. Nothing is uploaded." -ForegroundColor Green
Write-Host ""
Write-Host "  Always start it on port $Port. Your grades are stored against" -ForegroundColor Yellow
Write-Host "  this exact address, so a different port looks like a fresh," -ForegroundColor Yellow
Write-Host "  empty install." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Keep this window open while you work. Close it to stop."
Write-Host "  ------------------------------------------------------------"
Write-Host ""

Start-Process $Origin

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $rel = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
      $rel = $rel -replace '/', '\'

      $full = Join-Path $Root $rel
      # Refuse anything that resolves outside the served folder.
      #
      # The trailing separator matters: without it a sibling folder whose name
      # merely starts with the same characters — C:\Work next to C:\Workbench —
      # would satisfy the prefix test and be served.
      $resolved = [System.IO.Path]::GetFullPath($full)
      $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
      if (-not ($resolved + [System.IO.Path]::DirectorySeparatorChar).StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 403
        $response.Close()
        continue
      }

      if ((Test-Path $resolved) -and (Get-Item $resolved).PSIsContainer) {
        $resolved = Join-Path $resolved 'index.html'
      }

      if (Test-Path $resolved -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($resolved).ToLower()
        $type = $Mime[$ext]
        if (-not $type) { $type = 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($resolved)
        $response.ContentType = $type
        # Never cache: a stale module would leave a replaced folder looking unchanged.
        $response.Headers.Add('Cache-Control', 'no-store, must-revalidate')
        $response.Headers.Add('Pragma', 'no-cache')
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $rel")
        $response.ContentType = 'text/plain; charset=utf-8'
        $response.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      try { $response.StatusCode = 500 } catch { }
    } finally {
      try { $response.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
