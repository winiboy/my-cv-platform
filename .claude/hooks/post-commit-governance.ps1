#Requires -Version 5.1
# PostToolUse: end FAST TRACK when the story's commit lands.
#
# FAST TRACK is scoped to exactly one user story. Until now the only things
# ending it were the 24h expiry and an instruction in /story-start telling the
# model to reset the state. An instruction is not enforcement - the failure it
# leaves open is the worst one available here: a stale FAST TRACK silently
# widening permissions for unrelated later work.
#
# This closes it mechanically. PostToolUse fires only after the tool SUCCEEDS
# (failures go to PostToolUseFailure), so a rejected commit leaves the mode
# alone and the story continues.
#
# Deliberately does NOT fire on `git commit --amend`: an amend refines a commit
# that has not finished landing, so the story is not over. Re-arming after a
# real commit is `/governance fast-track`, which confirms first.
#
# Fails open by design. Any error here must never block a commit that already
# succeeded - the commit is done, and this only tidies state.

$ErrorActionPreference = 'Continue'

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

    $payload = $raw | ConvertFrom-Json -ErrorAction Stop
    $command = ''
    try { $command = [string]$payload.tool_input.command } catch {}
    if ([string]::IsNullOrWhiteSpace($command)) { exit 0 }

    $c = $command.Trim()
    if ($c -notmatch '(^|[;&|]\s*)git\s+commit(\s|$)') { exit 0 }
    if ($c -match '(^|\s)--amend(\s|$)') { exit 0 }

    $cwd = ''
    try { $cwd = [string]$payload.cwd } catch {}
    if ([string]::IsNullOrWhiteSpace($cwd)) { $cwd = (Get-Location).Path }

    $statePath = Join-Path $cwd '.claude\governance-state.json'
    if (-not (Test-Path -LiteralPath $statePath)) { exit 0 }

    $stateRaw = Get-Content -LiteralPath $statePath -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($stateRaw)) { exit 0 }
    $state = $stateRaw | ConvertFrom-Json -ErrorAction Stop

    if ([string]$state.mode -ne 'FAST_TRACK') { exit 0 }

    $storyId = [string]$state.storyId
    $now = (Get-Date).ToUniversalTime().ToString('o')

    $state | Add-Member -NotePropertyName 'mode'    -NotePropertyValue 'STANDARD' -Force
    $state | Add-Member -NotePropertyName 'endedAt' -NotePropertyValue $now       -Force
    $state | Add-Member -NotePropertyName 'endedBy' -NotePropertyValue 'post-commit hook: story commit landed' -Force
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding UTF8

    $msg = "FAST TRACK ended: the commit for $storyId landed, so approval mode is back to STANDARD. Start the next story with /story-start."
    $out = @{ systemMessage = $msg } | ConvertTo-Json -Depth 4 -Compress
    [Console]::Out.Write($out)
    exit 0
} catch {
    exit 0
}
