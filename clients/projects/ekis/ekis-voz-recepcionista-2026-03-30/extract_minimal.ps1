$d = Get-Content 'ekis-workflow-v7-limpio.json' -Raw | ConvertFrom-Json
$m = @{}
if ($d.name) { $m.name = $d.name }
if ($d.nodes) { $m.nodes = $d.nodes }
if ($d.connections) { $m.connections = $d.connections }
$m | ConvertTo-Json -Depth 100 | Out-File 'ekis-workflow-v7-minimal.json' -Encoding UTF8
Write-Host "Minimal workflow created successfully"
