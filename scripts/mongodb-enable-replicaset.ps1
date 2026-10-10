# Enables a single-node replica set ("rs0") on your INSTALLED MongoDB — no Docker.
# Your existing data directory and records are kept exactly as they are.
#
# Run in an Administrator PowerShell (from the project folder or anywhere):
#   powershell -ExecutionPolicy Bypass -File scripts\mongodb-enable-replicaset.ps1
#
# Options:
#   -ConfigPath "D:\path\to\mongod.cfg"   # if auto-detection finds the wrong file
#   -Port 27017                           # the port your mongod listens on
#   -SetName rs0                          # must match MONGODB_URI's replicaSet=

param(
    [string]$ConfigPath,
    [int]$Port = 27017,
    [string]$SetName = 'rs0'
)

$ErrorActionPreference = 'Stop'
function Say([string]$msg, [string]$color = 'Gray') { Write-Host $msg -ForegroundColor $color }

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Say 'ERROR: run this script in an Administrator PowerShell.' Red
    Say '(It edits mongod.cfg and restarts the MongoDB service; your data is not touched.)'
    exit 1
}

# 1. Locate mongod.cfg (MSI installs keep it under Program Files).
if (-not $ConfigPath) {
    $found = Get-ChildItem -Path @(
        "$env:ProgramFiles\MongoDB\Server\*\bin\mongod.cfg",
        "$env:ProgramFiles\MongoDB\Server\*\mongod.cfg"
    ) -ErrorAction SilentlyContinue
    if (-not $found) {
        Say 'ERROR: mongod.cfg not found under "C:\Program Files\MongoDB\Server".' Red
        Say 'Pass it explicitly:  -ConfigPath "D:\path\to\mongod.cfg"'
        exit 1
    }
    $ConfigPath = ($found | Sort-Object FullName | Select-Object -Last 1).FullName
}
Say "Using config: $ConfigPath"

# 2. Add replication settings if they are missing.
$content = Get-Content -Path $ConfigPath -Raw
if ($content -match 'replSetName') {
    Say 'replication.replSetName is already set in the config; leaving it unchanged.' Green
} else {
    Copy-Item $ConfigPath "$ConfigPath.bak" -Force
    Say "Backed up config to $ConfigPath.bak"
    if (-not $content.EndsWith("`n")) { $content += "`r`n" }
    $content += "`r`n# Single-node replica set so the app can use MongoDB transactions.`r`nreplication:`r`n  replSetName: $SetName`r`n"
    Set-Content -Path $ConfigPath -Value $content -NoNewline
    Say 'Added to config:' Green
    Say "  replication:"
    Say "    replSetName: $SetName"
}

# 3. Restart MongoDB (service), or guide a manually-run mongod.
$service = Get-Service | Where-Object { $_.Name -like '*mongo*' } | Select-Object -First 1
if ($service) {
    Say "Restarting service '$($service.Name)'..."
    try { Restart-Service $service.Name -ErrorAction Stop } catch { Start-Service $service.Name -ErrorAction SilentlyContinue }
    if ((Get-Service $service.Name).Status -ne 'Running') {
        Say "ERROR: service '$($service.Name)' did not start. Check its logs in Event Viewer." Red
        exit 1
    }
} else {
    Say 'No MongoDB service found.' Yellow
    Say 'If you start mongod yourself: stop it, then start it again with the SAME --dbpath plus:'
    Say "  mongod --dbpath <your-dbpath> --replSet $SetName"
    Say 'Press Enter once mongod is running...'
    [void](Read-Host)
}

# 4. Wait until MongoDB accepts connections.
Say "Waiting for MongoDB on 127.0.0.1:$Port ..."
$up = $false
for ($i = 0; $i -lt 40; $i++) {
    $up = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
    if ($up) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $up) { Say "ERROR: nothing is listening on 127.0.0.1:$Port — check the mongod port and logs." Red; exit 1 }
Say 'MongoDB is accepting connections.' Green

# 5. Find mongosh (bundled with the server, or on PATH).
$mongosh = (Get-Command mongosh -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($mongosh) { $mongosh = $mongosh.Source }
else {
    $bundled = Get-ChildItem "$env:ProgramFiles\MongoDB\Server\*\bin\mongosh.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($bundled) { $mongosh = $bundled.FullName }
}
if (-not $mongosh) {
    Say 'mongosh (MongoDB Shell) was not found.' Yellow
    Say 'Install it from https://www.mongodb.com/try/download/shell and run once:'
    Say "  mongosh --eval `"rs.initiate({_id:'$SetName',members:[{_id:0,host:'127.0.0.1:$Port'}]})`""
    exit 1
}

# 6. Initialize the replica set once (skipped when already done).
$hello = (& $mongosh "mongodb://127.0.0.1:$Port" --quiet --eval "print(db.adminCommand({hello:1}).setName || 'STANDALONE')").Trim()
if ($hello -eq $SetName) {
    Say "Already a replica set (setName='$hello'); nothing to initialize." Green
    $hello = "$SetName True"
} elseif ($hello -ne 'STANDALONE' -and $hello -ne '') {
    Say "This server belongs to a DIFFERENT replica set ('$hello')." Yellow
    Say "Either keep it and point MONGODB_URI at it with replicaSet=$hello, or reconfigure it as $SetName (see MongoDB docs)."
    exit 1
} else {
    Say 'Initializing the replica set (existing data is kept)...'
    & $mongosh "mongodb://127.0.0.1:$Port" --quiet --eval "printjson(db.adminCommand({replSetInitiate:{_id:'$SetName',members:[{_id:0,host:'127.0.0.1:$Port'}]}}))" | Out-Null
    $hello = ''
    for ($i = 0; $i -lt 40; $i++) {
        $hello = (& $mongosh "mongodb://127.0.0.1:$Port/?replicaSet=$SetName&directConnection=true" --quiet --eval "const h=db.adminCommand({hello:1}); print((h.setName||'')+' '+(h.isWritablePrimary||h.ismaster))").Trim()
        if ($hello -like "$SetName True*") { break }
        Start-Sleep -Milliseconds 500
    }
}

if ($hello -like "$SetName True*") {
    Say ''
    Say "Done: '$SetName' is a writable single-node replica set on 127.0.0.1:$Port." Green
    Say 'Your existing data was kept. Keep the default MONGODB_URI in .env.local and run:'
    Say '  npm run dev'
} else {
    Say 'The replica set did not become PRIMARY in time. Inspect with:  mongosh --eval "rs.status()"' Yellow
    exit 1
}
