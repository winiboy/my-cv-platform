#Requires -Version 5.1
# Governance approval modes - fixture suite.
#
# Covers the two decisions added on top of Phase 05: the ASK backstop for the
# non-negotiable gates, and the scoped ALLOW that FAST TRACK grants.
#
# The Phase 05 suite (run-phase-05-3.ps1) still owns every deny rule. The one
# property both suites must agree on is precedence: a command Phase 05 denies
# must stay denied, never soften to a prompt. That is asserted here too, since
# it is the property most likely to break when rules are appended.
#
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/tests/run-governance-modes.ps1

$ErrorActionPreference = 'Stop'
$HOOK = Join-Path (Get-Location).Path '.claude/hooks/pre-tool-guard.ps1'
$root = Join-Path $env:TEMP ('governance-modes-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$results = @()

function New-FixtureRepo {
    param([string]$Path, $State, [string]$Branch = 'chore/governance-fixture')
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $Path '.claude') -Force | Out-Null
    Push-Location $Path
    # The empty commit is required, not cosmetic: on an unborn branch
    # `git rev-parse --abbrev-ref HEAD` fails, the hook reads no branch at all,
    # and every branch-dependent rule silently goes dormant. A fixture without
    # it tests nothing about main.
    & git init -b $Branch --quiet
    & git -c user.email=x@x -c user.name=x commit --allow-empty -m init --quiet
    Pop-Location
    if ($null -ne $State) {
        $target = Join-Path $Path '.claude\governance-state.json'
        if ($State -is [string]) {
            Set-Content -LiteralPath $target -Value $State -Encoding UTF8
        } else {
            $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $target -Encoding UTF8
        }
    }
}

function Test-Case {
    param([string]$Name, [string]$Command, [string]$Cwd, [string]$Expected, [string]$Tool = 'Bash')
    $payload = @{ tool_name = $Tool; cwd = $Cwd }
    if ($Tool -in @('Write', 'Edit')) {
        $payload['tool_input'] = @{ file_path = $Command; content = 'x' }
    } else {
        $payload['tool_input'] = @{ command = $Command }
    }
    $json = $payload | ConvertTo-Json -Compress -Depth 6
    $out = $json | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $HOOK
    $decision = 'no-decision'
    if ($out) {
        try { $decision = ($out | ConvertFrom-Json -ErrorAction Stop).hookSpecificOutput.permissionDecision }
        catch { $decision = 'parse-error' }
    }
    $status = if ($decision -eq $Expected) { 'PASS' } else { 'FAIL' }
    $script:results += [pscustomobject]@{ Name = $Name; Decision = $decision; Expected = $Expected; Status = $status }
}

$future = (Get-Date).ToUniversalTime().AddDays(7).ToString('o')
$past   = (Get-Date).ToUniversalTime().AddDays(-1).ToString('o')

$stdCwd = Join-Path $root 'standard'
New-FixtureRepo -Path $stdCwd -State @{ storyId = 'US-900'; storyTitle = 'fixture'; mode = 'STANDARD'; activatedAt = $past; expiresOn = $future }

$ftCwd = Join-Path $root 'fasttrack'
New-FixtureRepo -Path $ftCwd -State @{ storyId = 'US-901'; storyTitle = 'fixture'; mode = 'FAST_TRACK'; activatedAt = $past; expiresOn = $future }

$expiredCwd = Join-Path $root 'expired'
New-FixtureRepo -Path $expiredCwd -State @{ storyId = 'US-902'; storyTitle = 'fixture'; mode = 'FAST_TRACK'; activatedAt = $past; expiresOn = $past }

$nostoryCwd = Join-Path $root 'nostory'
New-FixtureRepo -Path $nostoryCwd -State @{ storyId = ''; mode = 'FAST_TRACK'; expiresOn = $future }

$brokenCwd = Join-Path $root 'broken'
New-FixtureRepo -Path $brokenCwd -State '{ this is not json'

$absentCwd = Join-Path $root 'absent'
New-FixtureRepo -Path $absentCwd -State $null

# --- The gates hold in BOTH modes -----------------------------------------
# Fast Track speeds up writing code. It never speeds up shipping code.
foreach ($m in @(@{ N = 'STANDARD'; C = $stdCwd }, @{ N = 'FAST_TRACK'; C = $ftCwd })) {
    Test-Case "GATE [$($m.N)] git commit"          'git commit -m "x"'            $m.C 'ask'
    Test-Case "GATE [$($m.N)] git push"            'git push'                     $m.C 'ask'
    Test-Case "GATE [$($m.N)] gh pr create"        'gh pr create --fill'          $m.C 'ask'
    Test-Case "GATE [$($m.N)] gh pr merge"         'gh pr merge 27 --merge'       $m.C 'ask'
    Test-Case "GATE [$($m.N)] git merge"           'git merge feature/x'          $m.C 'ask'
    Test-Case "GATE [$($m.N)] git rebase"          'git rebase main'              $m.C 'ask'
    Test-Case "GATE [$($m.N)] branch deletion"     'git branch -D old'            $m.C 'ask'
    Test-Case "GATE [$($m.N)] tag deletion"        'git tag -d v1'                $m.C 'ask'
    Test-Case "GATE [$($m.N)] add dependency"      'pnpm add left-pad'            $m.C 'ask'
    Test-Case "GATE [$($m.N)] npm install pkg"     'npm install express'          $m.C 'ask'
    Test-Case "GATE [$($m.N)] rm -rf"              'rm -rf build'                 $m.C 'ask'
    Test-Case "GATE [$($m.N)] supabase db push"    'pnpm supabase db push'        $m.C 'ask'
    Test-Case "GATE [$($m.N)] remote psql"         'psql -h db.example.com -c "select 1"' $m.C 'ask'
    Test-Case "GATE [$($m.N)] vercel deploy"       'vercel --prod'                $m.C 'ask'
    Test-Case "GATE [$($m.N)] gh api write"        'gh api repos/o/r -X PUT'      $m.C 'ask'
    Test-Case "GATE [$($m.N)] edit CI workflow"    '.github/workflows/ci.yml'     $m.C 'ask' 'Edit'
    Test-Case "GATE [$($m.N)] edit package.json"   'package.json'                 $m.C 'ask' 'Edit'
    Test-Case "GATE [$($m.N)] edit migration"      'supabase/migrations/007_x.sql' $m.C 'ask' 'Edit'
    Test-Case "GATE [$($m.N)] edit the hook"       '.claude/hooks/pre-tool-guard.ps1' $m.C 'ask' 'Edit'
    Test-Case "GATE [$($m.N)] edit settings"       '.claude/settings.local.json'  $m.C 'ask' 'Edit'
}

# --- DENY still beats ASK -------------------------------------------------
# The ordering property. If an appended rule ever moves the gate check above
# the deny rules, these soften to 'ask' and this suite says so.
foreach ($m in @(@{ N = 'STANDARD'; C = $stdCwd }, @{ N = 'FAST_TRACK'; C = $ftCwd })) {
    Test-Case "DENY>ASK [$($m.N)] push --force"       'git push --force'            $m.C 'deny'
    Test-Case "DENY>ASK [$($m.N)] push -f"            'git push -f'                 $m.C 'deny'
    Test-Case "DENY>ASK [$($m.N)] push --force-w-lease" 'git push --force-with-lease' $m.C 'deny'
    Test-Case "DENY>ASK [$($m.N)] commit -a"          'git commit -am "x"'          $m.C 'deny'
    Test-Case "DENY>ASK [$($m.N)] reset --hard"       'git reset --hard HEAD~1'     $m.C 'deny'
    Test-Case "DENY>ASK [$($m.N)] git clean"          'git clean -fd'               $m.C 'deny'
    Test-Case "DENY>ASK [$($m.N)] .env read"          'cat .env'                    $m.C 'deny'
    Test-Case "DENY>ASK [$($m.N)] .env edit"          '.env.local'                  $m.C 'deny' 'Edit'
}

# --- FAST TRACK grants routine local work ---------------------------------
Test-Case 'FT grants pnpm lint'          'pnpm lint'                      $ftCwd 'allow'
Test-Case 'FT grants pnpm typecheck'     'pnpm typecheck'                 $ftCwd 'allow'
Test-Case 'FT grants pnpm test'          'pnpm test'                      $ftCwd 'allow'
Test-Case 'FT grants pnpm build'         'pnpm build'                     $ftCwd 'allow'
Test-Case 'FT grants supabase db reset'  'pnpm supabase db reset'         $ftCwd 'allow'
Test-Case 'FT grants explicit git add'   'git add -- src/a.ts src/b.ts'   $ftCwd 'allow'
Test-Case 'FT grants local psql'         'docker exec -i supabase_db_my-cv-platform psql -U postgres' $ftCwd 'allow'
Test-Case 'FT grants source edit'        'src/lib/foo.ts'                 $ftCwd 'allow' 'Edit'
Test-Case 'FT grants component edit'     'src/components/Bar.tsx'         $ftCwd 'allow' 'Write'

# --- FAST TRACK does NOT grant what it must not ---------------------------
Test-Case 'FT refuses node -e'           'node -e "require(''fs'').unlinkSync(''x'')"' $ftCwd 'no-decision'
Test-Case 'FT refuses python'            'python evil.py'                 $ftCwd 'no-decision'
Test-Case 'FT refuses curl'              'curl https://example.com'       $ftCwd 'no-decision'
Test-Case 'FT refuses pnpm install'      'pnpm install'                   $ftCwd 'no-decision'

# --- STANDARD grants nothing ----------------------------------------------
# Same commands, STANDARD mode: the hook defers to the permission layer.
Test-Case 'STD defers pnpm lint'         'pnpm lint'                      $stdCwd 'no-decision'
Test-Case 'STD defers source edit'       'src/lib/foo.ts'                 $stdCwd 'no-decision' 'Edit'

# --- Degraded state always falls back to STANDARD -------------------------
# Every one of these would be a silent privilege escalation if it granted.
Test-Case 'EXPIRED falls back'           'pnpm lint'                      $expiredCwd  'no-decision'
Test-Case 'NO STORY falls back'          'pnpm lint'                      $nostoryCwd  'no-decision'
Test-Case 'MALFORMED falls back'         'pnpm lint'                      $brokenCwd   'no-decision'
Test-Case 'ABSENT falls back'            'pnpm lint'                      $absentCwd   'no-decision'
Test-Case 'EXPIRED still gates commit'   'git commit -m "x"'              $expiredCwd  'ask'
Test-Case 'MALFORMED still gates commit' 'git commit -m "x"'              $brokenCwd   'ask'

# --- main beats everything ------------------------------------------------
# Phase 05 forbids repository mutation on main outright. Forbidden must beat
# prompted AND beat granted: an early version returned 'ask' for git commit on
# main, and would have let FAST TRACK grant mutating commands there.
$mainCwd = Join-Path $root 'mainft'
New-FixtureRepo -Path $mainCwd -Branch 'main' -State @{ storyId = 'US-903'; mode = 'FAST_TRACK'; activatedAt = $past; expiresOn = $future }

Test-Case 'MAIN beats gate: git commit'   'git commit -m "x"'            $mainCwd 'deny'
Test-Case 'MAIN beats gate: pnpm add'     'pnpm add left-pad'            $mainCwd 'deny'
Test-Case 'MAIN beats FT: git add'        'git add -- src/a.ts'          $mainCwd 'deny'
Test-Case 'MAIN beats FT: db reset'       'pnpm supabase db reset'       $mainCwd 'deny'
Test-Case 'MAIN beats FT: source edit'    'src/lib/foo.ts'               $mainCwd 'deny' 'Edit'
Test-Case 'MAIN still allows inspection'  'git status'                   $mainCwd 'no-decision'

# --- PostToolUse: FAST TRACK ends when the story commit lands -------------
# Without this, the only things ending FAST TRACK were a 24h expiry and an
# instruction. A stale FAST TRACK silently widens permissions for unrelated
# later work, so the reset has to be mechanical.
$POSTHOOK = Join-Path (Get-Location).Path '.claude/hooks/post-commit-governance.ps1'

function Test-PostHook {
    param([string]$Name, [string]$Command, [string]$StartMode, [string]$ExpectedMode)
    $dir = Join-Path $root ('post-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
    New-FixtureRepo -Path $dir -State @{ storyId = 'US-950'; mode = $StartMode; activatedAt = $past; expiresOn = $future }
    $payload = @{ tool_name = 'Bash'; cwd = $dir; tool_input = @{ command = $Command }; tool_response = @{ success = $true } }
    ($payload | ConvertTo-Json -Compress -Depth 6) |
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $POSTHOOK | Out-Null
    $after = (Get-Content -LiteralPath (Join-Path $dir '.claude\governance-state.json') -Raw | ConvertFrom-Json).mode
    $status = if ($after -eq $ExpectedMode) { 'PASS' } else { 'FAIL' }
    $script:results += [pscustomobject]@{ Name = $Name; Decision = $after; Expected = $ExpectedMode; Status = $status }
}

Test-PostHook 'POST commit ends FAST TRACK'   'git commit -m "US-950 done"'  'FAST_TRACK' 'STANDARD'
Test-PostHook 'POST commit -F ends it'        'git commit -F -'              'FAST_TRACK' 'STANDARD'
Test-PostHook 'POST amend does NOT end it'    'git commit --amend --no-edit' 'FAST_TRACK' 'FAST_TRACK'
Test-PostHook 'POST non-commit leaves it'     'pnpm lint'                    'FAST_TRACK' 'FAST_TRACK'
Test-PostHook 'POST git add leaves it'        'git add -- src/a.ts'          'FAST_TRACK' 'FAST_TRACK'
Test-PostHook 'POST STANDARD stays STANDARD'  'git commit -m "x"'            'STANDARD'   'STANDARD'
Test-PostHook 'POST chained commit ends it'   'git add -- a && git commit -m "x"' 'FAST_TRACK' 'STANDARD'

# The state file the hook writes must be parseable by tooling that is not
# PowerShell. Set-Content -Encoding UTF8 on PS 5.1 emits a BOM; ConvertFrom-Json
# tolerates it and JSON.parse does not, so the hook could write a file it could
# still read but node could not. Caught in real use, not by inspection.
$bomDir = Join-Path $root 'bomcheck'
New-FixtureRepo -Path $bomDir -State @{ storyId = 'US-951'; mode = 'FAST_TRACK'; activatedAt = $past; expiresOn = $future }
(@{ tool_name = 'Bash'; cwd = $bomDir; tool_input = @{ command = 'git commit -m "x"' } } | ConvertTo-Json -Compress -Depth 6) |
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $POSTHOOK | Out-Null
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $bomDir '.claude\governance-state.json'))
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
$results += [pscustomobject]@{
    Name = 'POST writes BOM-less JSON'
    Decision = $(if ($hasBom) { 'has-BOM' } else { 'no-BOM' })
    Expected = 'no-BOM'
    Status = $(if ($hasBom) { 'FAIL' } else { 'PASS' })
}

foreach ($r in $results) {
    "{0,-42} decision={1,-13} expected={2,-13} {3}" -f $r.Name, $r.Decision, $r.Expected, $r.Status
}
$pass = ($results | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
""
"TOTAL: $($results.Count)  PASS: $pass  FAIL: $fail"

Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
"Cleanup: removed $root"
if ($fail -gt 0) { exit 1 }
