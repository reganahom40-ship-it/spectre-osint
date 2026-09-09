# SPECTRE OSINT Platform PowerShell Runner
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "      SPECTRE INTELLIGENCE PLATFORM (v3.5)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

Write-Host "[*] Checking and verifying dependencies..." -ForegroundColor Yellow
python -m pip install -r requirements.txt --quiet

Write-Host "[+] Starting server at http://127.0.0.1:5000" -ForegroundColor Green
Write-Host "[*] Press Ctrl+C to terminate." -ForegroundColor DarkGray
Write-Host ""

python app.py
