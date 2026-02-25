# Build all Docker executor images (PowerShell)

Write-Host "Building GenAI-QA Docker Executor Images..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Change to script directory
Set-Location $PSScriptRoot

# Find all Dockerfile.* files
$dockerfiles = Get-ChildItem -Filter "Dockerfile.*" | Where-Object { $_.Name -ne "Dockerfile" }

if ($dockerfiles.Count -eq 0) {
    Write-Host "No Dockerfiles found!" -ForegroundColor Red
    exit 1
}

$total = $dockerfiles.Count
$current = 0

foreach ($dockerfile in $dockerfiles) {
    $current++
    # Extract image name from filename (e.g., Dockerfile.python-basic -> python-basic)
    $imageName = $dockerfile.Name -replace '^Dockerfile\.', ''
    
    Write-Host ""
    Write-Host "[$current/$total] Building $imageName..." -ForegroundColor Yellow
    docker build -t "genaiqa/${imageName}:latest" -f $dockerfile.Name .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to build $imageName" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ All $total images built successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Available images:" -ForegroundColor Cyan
docker images | Select-String "genaiqa"
