$content = Get-Content 'ekis-workflow-v7-minimal.json' -Raw -Encoding UTF8
$headers = @{
    'X-N8N-API-KEY' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjIiLCJpYXQiOjE3NDMxODc0MzksImV4cCI6MTc0NjY5NTQzOX0.g6jR-uM-FBkl-vRz7C78KfUxQDhIz14OaHq3bHk66Qs'
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
