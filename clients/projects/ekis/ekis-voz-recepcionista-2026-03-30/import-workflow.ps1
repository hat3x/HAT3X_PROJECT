$content = Get-Content 'ekis-workflow-v7-minimal.json' -Raw -Encoding UTF8
$headers = @{
    'X-N8N-API-KEY' = $env:N8N_API_KEY
    'Content-Type' = 'application/json'
}

try {
    $response = Invoke-RestMethod -Uri 'https://hat3xia.app.n8n.cloud/api/v1/workflows/ENzTkVbhjlMLJHIM' -Method Put -Headers $headers -Body $content -UseBasicParsing
    Write-Host "SUCCESS: Workflow imported"
    Write-Host "ID: $($response.id)"
    $response | ConvertTo-Json
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    }
    exit 1
}
