$script:HOOK = Join-Path (Get-Location).Path '.claude/hooks/pre-tool-guard.ps1'
$script:CWD = (Get-Location).Path

function Test-Case {
    param([string]$Name, [hashtable]$InputData, [string]$Expected)
    if (-not $InputData.ContainsKey('cwd')) { $InputData['cwd'] = $script:CWD }
    $json = $InputData | ConvertTo-Json -Compress -Depth 6
    $out = $json | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $script:HOOK
    $decision = 'no-decision'
    if ($out) {
        try {
            $parsed = $out | ConvertFrom-Json -ErrorAction Stop
            $decision = $parsed.hookSpecificOutput.permissionDecision
        } catch { $decision = 'parse-error' }
    }
    $status = if ($decision -eq $Expected) { 'PASS' } else { 'FAIL' }
    "{0,-45} decision={1,-12} expected={2,-12} {3}" -f $Name, $decision, $Expected, $status
}

function Test-Raw {
    param([string]$Name, [string]$RawJson, [string]$Expected)
    $out = $RawJson | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $script:HOOK
    $decision = 'no-decision'
    if ($out) {
        try {
            $parsed = $out | ConvertFrom-Json -ErrorAction Stop
            $decision = $parsed.hookSpecificOutput.permissionDecision
        } catch { $decision = 'parse-error' }
    }
    $status = if ($decision -eq $Expected) { 'PASS' } else { 'FAIL' }
    "{0,-45} decision={1,-12} expected={2,-12} {3}" -f $Name, $decision, $Expected, $status
}
