param([Parameter(Mandatory=$true)][string]$NodeBinary)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
$NodeBinary=(Resolve-Path -LiteralPath $NodeBinary).Path
$npmCli=Join-Path (Split-Path (Get-Command npm).Source -Parent) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) { throw 'Provide an npm installation with npm-cli.js beside its wrapper.' }
$evidenceRoot=Join-Path $repoRoot 'docs/decisions/evidence/publication-review'
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
$previousPath=$env:PATH
$previousTz=$env:TZ
$env:PATH=(Split-Path $NodeBinary -Parent)+';'+$env:PATH
$results=[System.Collections.Generic.List[object]]::new()
function Step([string]$name,[string]$command,[scriptblock]$action) {
    $watch=[Diagnostics.Stopwatch]::StartNew()
    $log=Join-Path $evidenceRoot ($name+'.txt')
    & $action *> $log
    $stepExit=$LASTEXITCODE
    $results.Add([ordered]@{name=$name;command=$command;exitCode=$stepExit;elapsedSeconds=[Math]::Round($watch.Elapsed.TotalSeconds,2);log=$name+'.txt'})
    Write-Output "$name exit=$stepExit"
    Get-Content -LiteralPath $log -Tail 9
    $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'matrix.json') -Encoding utf8
}
Push-Location $repoRoot
try {
    Step 'npm-ci' 'node22 npm-cli.js ci --prefix frontend --include=dev (npm 11.11.0)' { & $NodeBinary $npmCli ci --prefix frontend --include=dev }
    Push-Location (Join-Path $repoRoot 'frontend')
    try {
        Step 'lint' 'node22 node_modules/eslint/bin/eslint.js .' { & $NodeBinary node_modules/eslint/bin/eslint.js . }
        Step 'typescript-build' 'node22 node_modules/typescript/bin/tsc -b' { & $NodeBinary node_modules/typescript/bin/tsc -b }
        Step 'vite-build' 'node22 node_modules/vite/bin/vite.js build' { & $NodeBinary node_modules/vite/bin/vite.js build }
        $env:TZ='UTC'
        Step 'frontend-utc' 'TZ=UTC node22 --test tests/*.test.cjs' { & $NodeBinary --test 'tests/*.test.cjs' }
        $env:TZ='America/New_York'
        Step 'frontend-new-york' 'TZ=America/New_York node22 --test tests/*.test.cjs' { & $NodeBinary --test 'tests/*.test.cjs' }
    } finally { Pop-Location }
    foreach ($suite in @('Analysis','Adapter','Api','Architecture')) {
        $project="backend/EscalaLivre.$suite.Tests/EscalaLivre.$suite.Tests.csproj"
        Step ("dotnet-"+$suite.ToLowerInvariant()) "dotnet test $project -c Release" { dotnet test $project -c Release }
    }
    $env:TZ='UTC'
    Step 'parity-utc' 'TZ=UTC node22 tools/parity-differential.cjs' { & $NodeBinary tools/parity-differential.cjs }
    $env:TZ='America/New_York'
    Step 'parity-new-york' 'TZ=America/New_York node22 tools/parity-differential.cjs' { & $NodeBinary tools/parity-differential.cjs }
    $env:TZ='UTC'
    Step 'api-build' 'dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release' { dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release }
    $previousSecurityConfiguration=$env:SECURITY_BUILD_CONFIGURATION
    try {
        $env:SECURITY_BUILD_CONFIGURATION='Release'
        Step 'http-worker' 'SECURITY_BUILD_CONFIGURATION=Release TZ=UTC node22 backend/security.integration.cjs' { & $NodeBinary backend/security.integration.cjs }
    } finally { $env:SECURITY_BUILD_CONFIGURATION=$previousSecurityConfiguration }
    if (@($results | Where-Object {$_.exitCode -ne 0}).Count) { exit 1 }
} finally {
    Pop-Location
    $env:PATH=$previousPath
    $env:TZ=$previousTz
}
