#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$hook = Join-Path (Get-Location).Path '.claude/hooks/pre-tool-guard.ps1'

# $featCwd is assigned below, to a fixture repo rather than to this project.
#
# It used to be (Get-Location).Path - the real working copy - which made every
# expectation here depend on whatever governance mode happened to be active,
# since the hook reads .claude/governance-state.json from the cwd it is given.
# With FAST TRACK on, 23 cases flipped from no-decision to allow and this suite
# failed for a reason that had nothing to do with Phase 05.
#
# Phase 05's semantics are mode-independent, so its fixtures must be too. A
# fixture repo has no governance state, which the hook reads as STANDARD.

# Ephemeral test repos rooted in TEMP, under a per-run name.
#
# The name used to be fixed, and the run began by deleting it: a second run of
# this suite - another session, an agent worktree - wiped the fixtures of the
# first one mid-run, and every case after that point failed with "the cwd does
# not exist". Observed 2026-09-20, 23 cases. run-governance-modes.ps1 already
# rooted itself this way.
$root = Join-Path $env:TEMP ('phase-05-3-fixtures-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $root | Out-Null

function New-Repo {
    param([string]$Name, [string]$Branch)
    $path = Join-Path $root $Name
    New-Item -ItemType Directory -Path $path | Out-Null
    Push-Location $path
    & git init -b $Branch --quiet
    & git -c user.email=x@x -c user.name=x commit --allow-empty -m init --quiet
    Pop-Location
    return $path
}

function Set-PrdJson {
    param([string]$RepoPath, [string]$Content)
    $prd = Join-Path $RepoPath 'tasks/ralph'
    New-Item -ItemType Directory -Path $prd -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $prd 'prd.json') -Value $Content -Encoding UTF8 -NoNewline
}

# A directory below a fixture repo's root. CreateDirectory rather than
# New-Item, because New-Item -Path treats '[id]' as a wildcard on PS 5.1 and the
# real failure happened under src/app/api/resumes/[id]/download-docx.
function New-SubDir {
    param([string]$RepoPath, [string]$Relative)
    $path = Join-Path $RepoPath $Relative
    [System.IO.Directory]::CreateDirectory($path) | Out-Null
    return $path
}

# A bare clone: git reports a repository and a branch, but there is no work
# tree, so no repository root exists to hold a checked-out contract.
function New-BareRepo {
    param([string]$Name, [string]$SourceRepo)
    $path = Join-Path $root $Name
    # Local 'Continue': under the suite's 'Stop', any git stderr line (a
    # safe.directory warning, say) would abort the whole run on PS 5.1.
    $ErrorActionPreference = 'Continue'
    & git clone --bare --quiet $SourceRepo $path 2>$null
    if ($LASTEXITCODE -ne 0) { throw "fixture: git clone --bare failed for $Name" }
    return $path
}

# A linked worktree, where .git is a file rather than a directory - the layout
# of .claude/worktrees/*, where the original failure happened.
function New-Worktree {
    param([string]$Name, [string]$SourceRepo, [string]$Branch)
    $path = Join-Path $root $Name
    $ErrorActionPreference = 'Continue'
    & git -C $SourceRepo worktree add --quiet -b $Branch $path 2>$null
    if ($LASTEXITCODE -ne 0) { throw "fixture: git worktree add failed for $Name" }
    return $path
}

# Build the various Ralph test repos
$repoMain          = New-Repo 'r-main' 'main'
$repoChore         = New-Repo 'r-chore' 'chore/x'
$repoRalphMatch    = New-Repo 'r-ralph-match' 'ralph/foo'
$repoRalphMismatch = New-Repo 'r-ralph-mismatch' 'ralph/wrong'
$repoRalphNoPrd    = New-Repo 'r-ralph-noprd' 'ralph/foo'
$repoRalphBad      = New-Repo 'r-ralph-bad' 'ralph/foo'
$repoRalphNoBn     = New-Repo 'r-ralph-nobn' 'ralph/foo'
$repoRalphEmptyBn  = New-Repo 'r-ralph-emptybn' 'ralph/foo'
$repoChoreWithPrd  = New-Repo 'r-chore-with-prd' 'chore/x'
$featCwd           = New-Repo 'r-feature' 'chore/feature-work'

Set-PrdJson $repoRalphMatch    '{"project":"p","branchName":"ralph/foo"}'
Set-PrdJson $repoRalphMismatch '{"project":"p","branchName":"ralph/foo"}'
Set-PrdJson $repoRalphBad      'not valid json {'
Set-PrdJson $repoRalphNoBn     '{"project":"p"}'
Set-PrdJson $repoRalphEmptyBn  '{"project":"p","branchName":""}'
Set-PrdJson $repoChoreWithPrd  '{"project":"p","branchName":"ralph/foo"}'

# Tool calls routinely arrive with a cwd below the repository root: a subagent
# inherits the orchestrator's shell cwd, and an earlier `cd` persists. The
# Ralph contract lives at the root, so every verdict must be the same from
# here as from the root. (Milestone C Part 2 US-004, 2026-09-11: every write
# from a subdirectory was denied as "prd.json is missing".)
$subRalphMatch    = New-SubDir $repoRalphMatch    'src/app/api/resumes/[id]/download-docx'
$subRalphShallow  = New-SubDir $repoRalphMatch    'src'
$subRalphMismatch = New-SubDir $repoRalphMismatch 'src/deep'
$subRalphNoPrd    = New-SubDir $repoRalphNoPrd    'src/deep'
$subRalphBad      = New-SubDir $repoRalphBad      'src/deep'
$subChore         = New-SubDir $repoChore         'src/deep'
$subMain          = New-SubDir $repoMain          'src/deep'
$repoRalphBare    = New-BareRepo 'r-ralph-bare' $repoRalphMatch

# The root must be resolved without reading a path back out of git: PS 5.1
# decodes git's UTF-8 output with the console code page, so a non-ASCII root
# came back garbled and a valid contract read as missing. [char] rather than a
# literal, because PS 5.1 reads this BOM-less file as ANSI.
$repoRalphAccent  = New-Repo ('r-ralph-c' + [char]0x00E9 + 'dric') 'ralph/foo'
Set-PrdJson $repoRalphAccent '{"project":"p","branchName":"ralph/foo"}'
$subRalphAccent   = New-SubDir $repoRalphAccent 'src/deep'
# The deny twin. A garbled cwd skips every branch check and yields no-decision,
# so the allow cases above would still pass if the payload escaping broke. This
# one can only pass if the non-ASCII path reached git intact.
$repoRalphAccentNoPrd = New-Repo ('r-ralph-noprd-c' + [char]0x00E9 + 'dric') 'ralph/foo'

$wtRalph          = New-Worktree 'r-ralph-wt' $repoRalphMatch 'ralph/wt'
Set-PrdJson $wtRalph '{"project":"p","branchName":"ralph/wt"}'
$subWtRalph       = New-SubDir $wtRalph 'src/lib'

# A contract planted below the root is not the contract. The raw-cwd lookup
# accepted it; the root lookup finds none and denies.
$repoRalphDecoy   = New-Repo 'r-ralph-decoy' 'ralph/foo'
$subRalphDecoy    = New-SubDir $repoRalphDecoy 'src/deep'
Set-PrdJson $subRalphDecoy '{"project":"p","branchName":"ralph/foo"}'

# A junction whose target is a subdirectory of a Ralph repository. git resolves
# it to the real work tree, so the contract at the root must still be found;
# joining git's relative '../' answer onto the junction path overshot it.
$repoRalphJunction = New-Repo 'r-ralph-junction' 'ralph/foo'
Set-PrdJson $repoRalphJunction '{"project":"p","branchName":"ralph/foo"}'
$subRalphJunctionTarget = New-SubDir $repoRalphJunction 'src/deep'
$junctionRalph = Join-Path $root 'jn-ralph-sub'
New-Item -ItemType Junction -Path $junctionRalph -Target $subRalphJunctionTarget | Out-Null
$repoMainJunction = New-Repo 'r-main-junction' 'main'
$junctionMain = Join-Path $root 'jn-main-sub'
New-Item -ItemType Junction -Path $junctionMain -Target (New-SubDir $repoMainJunction 'src/deep') | Out-Null

# --- cwd spellings (independent review, 2026-09-15) ---
# The same kinds of repository reached through cwd spellings that used to skip
# every branch rule: a space plus a trailing backslash, a non-ASCII path sent as
# raw UTF-8 the way Claude Code sends it, and the \\localhost\C$ admin share.
# [char] rather than a literal, because PS 5.1 reads this BOM-less file as ANSI.
$accentDir        = 'caf' + [char]0x00E9 + ' dir'
$spMain           = New-Repo 'some dir\r-main' 'main'
$spRalphNoPrd     = New-Repo 'some dir\r-ralph-noprd' 'ralph/foo'
$spFeat           = New-Repo 'some dir\r-feature' 'chore/x'
$acMain           = New-Repo "$accentDir\r-main" 'main'
$acRalphNoPrd     = New-Repo "$accentDir\r-ralph-noprd" 'ralph/foo'
$acFeat           = New-Repo "$accentDir\r-feature" 'chore/x'
[System.IO.Directory]::CreateDirectory((Join-Path $spRalphNoPrd 'src')) | Out-Null

# Lexical only: the hook maps this spelling back to the drive path, so the
# cases below do not depend on the admin share being reachable.
function ConvertTo-LocalhostUnc {
    param([string]$Path)
    return '\\localhost\' + $Path.Substring(0, 1) + '$' + $Path.Substring(2)
}
$uncSpMain        = ConvertTo-LocalhostUnc $spMain
$uncSpRalphNoPrdSub = ConvertTo-LocalhostUnc (Join-Path $spRalphNoPrd 'src')
$uncSpFeat        = ConvertTo-LocalhostUnc $spFeat
$uncAcMainSlash   = (ConvertTo-LocalhostUnc $acMain) + '\'

# --- cwds whose branch git cannot determine ---
# A .git file pointing nowhere: visibly a repository, but git fails on it. That
# is the state git's safe.directory refusal produces, reproducible without
# changing ownership. A missing directory, and no cwd at all, are the others.
$repoBrokenGit    = Join-Path $root 'r-broken-gitfile'
New-Item -ItemType Directory -Path $repoBrokenGit | Out-Null
[System.IO.File]::WriteAllText((Join-Path $repoBrokenGit '.git'), 'gitdir: ' + (Join-Path $root 'no-such-gitdir'))
$cwdMissing       = Join-Path $root 'no-such-cwd'
$cwdMissingAccent = Join-Path $root ('no-such-caf' + [char]0x00E9)
$dirNoRepo        = Join-Path $root 'not-a-repo'
New-Item -ItemType Directory -Path $dirNoRepo | Out-Null

# Unborn branches: no commit yet. rev-parse --abbrev-ref HEAD fails there, which
# read as "no branch" and skipped the main block; symbolic-ref names it.
function New-UnbornRepo {
    param([string]$Name, [string]$Branch)
    $path = Join-Path $root $Name
    New-Item -ItemType Directory -Path $path | Out-Null
    Push-Location $path
    & git init -b $Branch --quiet
    Pop-Location
    return $path
}
$repoUnbornMain   = New-UnbornRepo 'r-unborn-main' 'main'
$repoUnbornFeat   = New-UnbornRepo 'r-unborn-feature' 'chore/x'

$results = New-Object System.Collections.Generic.List[object]

# Sends the payload as raw UTF-8 bytes, as Claude Code does, and reads the reply
# as strict UTF-8. The pipe in Invoke-Fixture can do neither: PS 5.1 writes to a
# native process in ASCII (a non-ASCII cwd arrives as '?') and decodes the reply
# with the console code page, which hides a reply that is not valid UTF-8.
function Send-Utf8Payload {
    param([string]$Json)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $hook + '"'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false, $true)
    $proc = [System.Diagnostics.Process]::Start($psi)
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($Json)
    $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $proc.StandardInput.Close()
    try { $out = $proc.StandardOutput.ReadToEnd() } catch { $out = 'reply is not valid UTF-8' }
    $proc.WaitForExit()
    return $out
}

function Invoke-Fixture {
    param([string]$Name, [hashtable]$InputData, [string]$Expected, [string]$ReasonLike, [switch]$Utf8)
    $json = $InputData | ConvertTo-Json -Compress -Depth 6
    if ($Utf8) {
        $out = Send-Utf8Payload -Json $json
    } else {
        # Escape non-ASCII as \uXXXX: PS 5.1 pipes to a native process in ASCII,
        # so a raw non-ASCII cwd would arrive as '?' and never reach the code
        # under test. The hook's own stdin decoding is covered by the -Utf8
        # cases, which send the same payload as unescaped bytes.
        $json = [regex]::Replace($json, '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
        $out = $json | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $hook
    }
    $decision = 'no-decision'
    $reason = ''
    if ($out) {
        try {
            $parsed = $out | ConvertFrom-Json -ErrorAction Stop
            $decision = $parsed.hookSpecificOutput.permissionDecision
            $reason = [string]$parsed.hookSpecificOutput.permissionDecisionReason
        } catch { $decision = 'parse-error' }
    }
    $status = if ($decision -eq $Expected) { 'PASS' } else { 'FAIL' }
    # Where the same decision can come from more than one rule, pin which one.
    if ($status -eq 'PASS' -and $ReasonLike -and $reason -notlike "*$ReasonLike*") {
        $status = 'FAIL'
        $decision = "$decision (other rule: $reason)"
    }
    $script:results.Add([pscustomobject]@{
        Name     = $Name
        Decision = $decision
        Expected = $Expected
        Status   = $status
    })
}

$fixtures = @(
    # --- Ralph applicability & branch invariant ---
    @{ Name='RALPH: chore/x, no prd, Write';         Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoChore}          ; Exp='no-decision' },
    @{ Name='RALPH: chore/x, prd present, Write';    Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoChoreWithPrd}   ; Exp='no-decision' },
    @{ Name='RALPH: ralph/foo == branchName, Write'; Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphMatch}     ; Exp='no-decision' },
    @{ Name='RALPH: ralph/wrong != branchName, Write'; Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphMismatch}; Exp='deny' },
    @{ Name='RALPH: ralph/foo, no prd.json, Write';  Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphNoPrd}     ; Exp='deny' },
    @{ Name='RALPH: ralph/foo, malformed prd, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphBad}       ; Exp='deny' },
    @{ Name='RALPH: ralph/foo, branchName missing, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphNoBn} ; Exp='deny' },
    @{ Name='RALPH: ralph/foo, branchName empty, Write'; Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphEmptyBn}; Exp='deny' },
    @{ Name='RALPH: ralph mismatch, Read allowed';   Data=@{tool_name='Read';  tool_input=@{file_path='x'}; cwd=$repoRalphMismatch}  ; Exp='no-decision' },
    @{ Name='RALPH: ralph match, Bash git status';   Data=@{tool_name='Bash';  tool_input=@{command='git status'}; cwd=$repoRalphMatch}; Exp='no-decision' },
    @{ Name='RALPH: ralph mismatch, Bash git add';   Data=@{tool_name='Bash';  tool_input=@{command='git add src/x'}; cwd=$repoRalphMismatch}; Exp='deny' },

    # --- Ralph contract resolves from the repository root, not the cwd ---
    @{ Name='RALPH-CWD: match, [id] subdir, Write';   Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subRalphMatch}      ; Exp='no-decision' },
    @{ Name='RALPH-CWD: match, [id] subdir, Edit';    Data=@{tool_name='Edit';  tool_input=@{file_path='x'}; cwd=$subRalphMatch}      ; Exp='no-decision' },
    @{ Name='RALPH-CWD: match, [id] subdir, git add'; Data=@{tool_name='Bash';  tool_input=@{command='git add -- src/x.ts'}; cwd=$subRalphMatch}; Exp='no-decision' },
    @{ Name='RALPH-CWD: match, one level down, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subRalphShallow}    ; Exp='no-decision' },
    @{ Name='RALPH-CWD: mismatch, subdir, Write';     Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subRalphMismatch}   ; Exp='deny' },
    @{ Name='RALPH-CWD: no prd at root, subdir, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subRalphNoPrd}     ; Exp='deny' },
    @{ Name='RALPH-CWD: malformed prd, subdir, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subRalphBad}        ; Exp='deny' },
    @{ Name='RALPH-CWD: chore/x, subdir, Write';      Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subChore}           ; Exp='no-decision' },
    @{ Name='RALPH-CWD: main, subdir, Write';         Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subMain}            ; Exp='deny' },
    @{ Name='RALPH-CWD: match, subdir, git push';     Data=@{tool_name='Bash';  tool_input=@{command='git push'}; cwd=$subRalphMatch} ; Exp='ask' },
    @{ Name='RALPH-CWD: match, subdir, push --force'; Data=@{tool_name='Bash';  tool_input=@{command='git push --force'}; cwd=$subRalphMatch}; Exp='deny' },
    @{ Name='RALPH-CWD: match, subdir, cat .env';     Data=@{tool_name='Bash';  tool_input=@{command='cat .env'}; cwd=$subRalphMatch} ; Exp='deny' },
    # No work tree: the root cannot be resolved, so the contract cannot be
    # verified. That must deny, never fall through to allow.
    # Why= pins the rule: the raw-cwd lookup also denied here, as "missing".
    @{ Name='RALPH-CWD: bare repo, Write';            Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphBare}      ; Exp='deny'; Why='no repository work tree' },
    @{ Name='RALPH-CWD: bare repo, git add';          Data=@{tool_name='Bash';  tool_input=@{command='git add -- src/x.ts'}; cwd=$repoRalphBare}; Exp='deny'; Why='no repository work tree' },
    @{ Name='RALPH-CWD: bare repo, Read allowed';     Data=@{tool_name='Read';  tool_input=@{file_path='x'}; cwd=$repoRalphBare}      ; Exp='no-decision' },
    @{ Name='RALPH-CWD: non-ASCII root, Write';       Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphAccent}    ; Exp='no-decision' },
    @{ Name='RALPH-CWD: non-ASCII root, subdir, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subRalphAccent}    ; Exp='no-decision' },
    @{ Name='RALPH-CWD: non-ASCII root, no prd, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphAccentNoPrd}; Exp='deny'; Why='prd.json is missing' },
    @{ Name='RALPH-CWD: worktree, subdir, Write';     Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subWtRalph}         ; Exp='no-decision' },
    @{ Name='RALPH-CWD: decoy prd in subdir, Write';  Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$subRalphDecoy}      ; Exp='deny'; Why='prd.json is missing' },

    # --- Safe staging classifier ---
    @{ Name='STAGE: git add explicit file';          Data=@{tool_name='Bash'; tool_input=@{command='git add src/a.ts'};       cwd=$featCwd}; Exp='no-decision' },
    @{ Name='STAGE: git add -- explicit file';       Data=@{tool_name='Bash'; tool_input=@{command='git add -- src/a.ts'};    cwd=$featCwd}; Exp='no-decision' },
    @{ Name='STAGE: git add two explicit files';     Data=@{tool_name='Bash'; tool_input=@{command='git add src/a.ts src/b.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='STAGE: git add src/ directory';         Data=@{tool_name='Bash'; tool_input=@{command='git add src/'};           cwd=$featCwd}; Exp='no-decision' },
    @{ Name='STAGE: git add .';                      Data=@{tool_name='Bash'; tool_input=@{command='git add .'};              cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add -- .';                   Data=@{tool_name='Bash'; tool_input=@{command='git add -- .'};           cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add -A';                     Data=@{tool_name='Bash'; tool_input=@{command='git add -A'};             cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add --all';                  Data=@{tool_name='Bash'; tool_input=@{command='git add --all'};          cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add --all .';                Data=@{tool_name='Bash'; tool_input=@{command='git add --all .'};        cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add :/';                     Data=@{tool_name='Bash'; tool_input=@{command='git add :/'};             cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add -u';                     Data=@{tool_name='Bash'; tool_input=@{command='git add -u'};             cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add --update';               Data=@{tool_name='Bash'; tool_input=@{command='git add --update'};       cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add *';                      Data=@{tool_name='Bash'; tool_input=@{command='git add *'};              cwd=$featCwd}; Exp='deny' },

    # --- Destructive Git ---
    @{ Name='DESTROY: git reset --hard';             Data=@{tool_name='Bash'; tool_input=@{command='git reset --hard'};       cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git reset --hard HEAD';        Data=@{tool_name='Bash'; tool_input=@{command='git reset --hard HEAD'};  cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git clean';                    Data=@{tool_name='Bash'; tool_input=@{command='git clean'};              cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git clean -f';                 Data=@{tool_name='Bash'; tool_input=@{command='git clean -f'};           cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git clean -fd';                Data=@{tool_name='Bash'; tool_input=@{command='git clean -fd'};          cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git clean -fdx';               Data=@{tool_name='Bash'; tool_input=@{command='git clean -fdx'};         cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git stash drop';               Data=@{tool_name='Bash'; tool_input=@{command='git stash drop'};         cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git stash clear';              Data=@{tool_name='Bash'; tool_input=@{command='git stash clear'};        cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git push --force';             Data=@{tool_name='Bash'; tool_input=@{command='git push --force'};       cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git push -f';                  Data=@{tool_name='Bash'; tool_input=@{command='git push -f'};            cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git push --force-with-lease';  Data=@{tool_name='Bash'; tool_input=@{command='git push --force-with-lease origin x'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git checkout -- file';         Data=@{tool_name='Bash'; tool_input=@{command='git checkout -- src/a.ts'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git checkout .';               Data=@{tool_name='Bash'; tool_input=@{command='git checkout .'};         cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git restore file';             Data=@{tool_name='Bash'; tool_input=@{command='git restore src/a.ts'};   cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git restore .';                Data=@{tool_name='Bash'; tool_input=@{command='git restore .'};          cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git rebase -i main';           Data=@{tool_name='Bash'; tool_input=@{command='git rebase -i main'};     cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git commit -a';                Data=@{tool_name='Bash'; tool_input=@{command='git commit -a'};          cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git commit -am "x"';           Data=@{tool_name='Bash'; tool_input=@{command='git commit -am "x"'};     cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git commit --all';             Data=@{tool_name='Bash'; tool_input=@{command='git commit --all'};       cwd=$featCwd}; Exp='deny' },

    # --- Safe / user-controlled (NO DECISION expected) ---
    @{ Name='SAFE: git restore --staged file';       Data=@{tool_name='Bash'; tool_input=@{command='git restore --staged src/a.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git branch -D foo';               Data=@{tool_name='Bash'; tool_input=@{command='git branch -D foo'};      cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git branch -d foo';               Data=@{tool_name='Bash'; tool_input=@{command='git branch -d foo'};      cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git tag -d tag';                  Data=@{tool_name='Bash'; tool_input=@{command='git tag -d v1'};          cwd=$featCwd}; Exp='no-decision' },
    @{ Name='GATED: git merge feature';               Data=@{tool_name='Bash'; tool_input=@{command='git merge feature'};      cwd=$featCwd}; Exp='ask' },
    @{ Name='SAFE: git rebase main';                 Data=@{tool_name='Bash'; tool_input=@{command='git rebase main'};        cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git commit -m';                   Data=@{tool_name='Bash'; tool_input=@{command='git commit -m "hi"'};     cwd=$featCwd}; Exp='no-decision' },
    @{ Name='GATED: git push';                        Data=@{tool_name='Bash'; tool_input=@{command='git push'};               cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: git push origin main';            Data=@{tool_name='Bash'; tool_input=@{command='git push origin main'};   cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: gh pr create';                    Data=@{tool_name='Bash'; tool_input=@{command='gh pr create'};           cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: gh pr merge 123';                 Data=@{tool_name='Bash'; tool_input=@{command='gh pr merge 123'};        cwd=$featCwd}; Exp='ask' },
    @{ Name='SAFE: git status';                      Data=@{tool_name='Bash'; tool_input=@{command='git status'};             cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git diff';                        Data=@{tool_name='Bash'; tool_input=@{command='git diff'};               cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git diff --cached';               Data=@{tool_name='Bash'; tool_input=@{command='git diff --cached'};      cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git log';                         Data=@{tool_name='Bash'; tool_input=@{command='git log'};                cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git show';                        Data=@{tool_name='Bash'; tool_input=@{command='git show'};               cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git rev-parse HEAD';              Data=@{tool_name='Bash'; tool_input=@{command='git rev-parse HEAD'};     cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git branch --show-current';       Data=@{tool_name='Bash'; tool_input=@{command='git branch --show-current'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git fetch origin';                Data=@{tool_name='Bash'; tool_input=@{command='git fetch origin'};       cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: pnpm lint';                       Data=@{tool_name='Bash'; tool_input=@{command='pnpm lint'};              cwd=$featCwd}; Exp='no-decision' },

    # --- MAIN branch regression ---
    @{ Name='MAIN: Write on main';                   Data=@{tool_name='Write'; tool_input=@{file_path='x'};                   cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: Edit on main';                    Data=@{tool_name='Edit';  tool_input=@{file_path='x'};                   cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: NotebookEdit on main';            Data=@{tool_name='NotebookEdit'; tool_input=@{notebook_path='x.ipynb'};  cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: Read on main';                    Data=@{tool_name='Read';  tool_input=@{file_path='x'};                   cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: Bash git status on main';         Data=@{tool_name='Bash';  tool_input=@{command='git status'};            cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: Bash pnpm lint on main';          Data=@{tool_name='Bash';  tool_input=@{command='pnpm lint'};             cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: Bash pnpm add on main';           Data=@{tool_name='Bash';  tool_input=@{command='pnpm add foo'};          cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: Bash git commit on main';         Data=@{tool_name='Bash';  tool_input=@{command='git commit -m x'};       cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: Bash git add file on main';       Data=@{tool_name='Bash';  tool_input=@{command='git add src/x'};         cwd=$repoMain}; Exp='deny' },

    # --- Leaving main is allowed; discarding work on the way out is not ---
    #
    # Landing on main used to be a dead end: writes denied, and no command
    # able to move off it. `gh pr merge --delete-branch` puts you there.
    # These assert the escape exists AND that it did not widen into a way to
    # throw away uncommitted work.
    @{ Name='MAIN: git switch -c new branch';        Data=@{tool_name='Bash';  tool_input=@{command='git switch -c docs/prd-x'};   cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: git checkout -b new branch';      Data=@{tool_name='Bash';  tool_input=@{command='git checkout -b docs/prd-x'}; cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: git switch existing branch';      Data=@{tool_name='Bash';  tool_input=@{command='git switch chore/feature-work'}; cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: git checkout existing branch';    Data=@{tool_name='Bash';  tool_input=@{command='git checkout chore/feature-work'}; cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: git checkout -f discards work';   Data=@{tool_name='Bash';  tool_input=@{command='git checkout -f main'};       cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: git switch --discard-changes';    Data=@{tool_name='Bash';  tool_input=@{command='git switch --discard-changes main'}; cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: git checkout . on main';          Data=@{tool_name='Bash';  tool_input=@{command='git checkout .'};             cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: git checkout -- file on main';    Data=@{tool_name='Bash';  tool_input=@{command='git checkout -- src/a.ts'};   cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: git checkout branch -- pathspec'; Data=@{tool_name='Bash';  tool_input=@{command='git checkout main -- src/a.ts'}; cwd=$repoMain}; Exp='deny' },

    # The same four escapes must not become a bypass on a feature branch
    # either: they are read-only classifications, not grants.
    @{ Name='DESTROY: git checkout -f on feature';   Data=@{tool_name='Bash';  tool_input=@{command='git checkout -f main'};       cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git checkout branch -- path';  Data=@{tool_name='Bash';  tool_input=@{command='git checkout main -- src/a.ts'}; cwd=$featCwd}; Exp='deny' },

    # ==================================================================
    # Phase 05.4 - Semantic .env* policy (adversarial DENY + ALLOW)
    # ==================================================================

    # --- File tool DENY: exact protected basenames ---
    @{ Name='ENV: Read .env';                        Data=@{tool_name='Read';  tool_input=@{file_path='.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.local';                  Data=@{tool_name='Read';  tool_input=@{file_path='.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.production';             Data=@{tool_name='Read';  tool_input=@{file_path='.env.production'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.production.local';       Data=@{tool_name='Read';  tool_input=@{file_path='.env.production.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.development';            Data=@{tool_name='Read';  tool_input=@{file_path='.env.development'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.test';                   Data=@{tool_name='Read';  tool_input=@{file_path='.env.test'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.sentry-build-plugin';    Data=@{tool_name='Read';  tool_input=@{file_path='.env.sentry-build-plugin'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read nested/.env.local';           Data=@{tool_name='Read';  tool_input=@{file_path='nested/dir/.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read ./.env';                      Data=@{tool_name='Read';  tool_input=@{file_path='./.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read Windows .\\.env.local';       Data=@{tool_name='Read';  tool_input=@{file_path='.\.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read case .ENV.LOCAL';             Data=@{tool_name='Read';  tool_input=@{file_path='.ENV.LOCAL'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Write .env.local';                 Data=@{tool_name='Write'; tool_input=@{file_path='.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Edit .env.local';                  Data=@{tool_name='Edit';  tool_input=@{file_path='.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: NotebookEdit .env';                Data=@{tool_name='NotebookEdit'; tool_input=@{notebook_path='.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Grep on .env.local (path field)';  Data=@{tool_name='Grep';  tool_input=@{pattern='KEY'; path='.env.local'}; cwd=$featCwd}; Exp='deny' },

    # --- File tool DENY: unknown .env.* variants (fail-safe) ---
    @{ Name='ENV: Read .env.staging';                Data=@{tool_name='Read';  tool_input=@{file_path='.env.staging'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.mycustom';               Data=@{tool_name='Read';  tool_input=@{file_path='.env.mycustom'}; cwd=$featCwd}; Exp='deny' },

    # --- File tool ALLOW: safe templates ---
    @{ Name='ENV: Read .env.example';                Data=@{tool_name='Read';  tool_input=@{file_path='.env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read .env.sample';                 Data=@{tool_name='Read';  tool_input=@{file_path='.env.sample'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read .env.template';               Data=@{tool_name='Read';  tool_input=@{file_path='.env.template'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Write .env.example';               Data=@{tool_name='Write'; tool_input=@{file_path='.env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Edit .env.template';               Data=@{tool_name='Edit';  tool_input=@{file_path='.env.template'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read nested/.env.example';         Data=@{tool_name='Read';  tool_input=@{file_path='nested/dir/.env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read case-mix .env.EXAMPLE';       Data=@{tool_name='Read';  tool_input=@{file_path='.env.EXAMPLE'}; cwd=$featCwd}; Exp='no-decision' },

    # --- File tool ALLOW: unrelated names ---
    @{ Name='ENV: Read .envrc';                      Data=@{tool_name='Read';  tool_input=@{file_path='.envrc'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read .environment';                Data=@{tool_name='Read';  tool_input=@{file_path='.environment'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read foo.env';                     Data=@{tool_name='Read';  tool_input=@{file_path='foo.env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read dotenv.config.ts';            Data=@{tool_name='Read';  tool_input=@{file_path='dotenv.config.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read src/lib/foo.ts';              Data=@{tool_name='Read';  tool_input=@{file_path='src/lib/foo.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Grep on src/';                     Data=@{tool_name='Grep';  tool_input=@{pattern='KEY'; path='src/'}; cwd=$featCwd}; Exp='no-decision' },

    # --- Bash direct file readers targeting secrets: DENY ---
    @{ Name='ENV: Bash cat .env';                    Data=@{tool_name='Bash'; tool_input=@{command='cat .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cat .env.local';              Data=@{tool_name='Bash'; tool_input=@{command='cat .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash head .env';                   Data=@{tool_name='Bash'; tool_input=@{command='head .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash tail .env.production';        Data=@{tool_name='Bash'; tool_input=@{command='tail .env.production'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash more .env.local';             Data=@{tool_name='Bash'; tool_input=@{command='more .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash less .env';                   Data=@{tool_name='Bash'; tool_input=@{command='less .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash type .env';                   Data=@{tool_name='Bash'; tool_input=@{command='type .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cat ./.env';                  Data=@{tool_name='Bash'; tool_input=@{command='cat ./.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cat quoted "".env""';         Data=@{tool_name='Bash'; tool_input=@{command='cat ".env"'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cat single-quoted';           Data=@{tool_name='Bash'; tool_input=@{command="cat '.env'"}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash grep KEY .env.local';         Data=@{tool_name='Bash'; tool_input=@{command='grep KEY .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash findstr KEY .env';            Data=@{tool_name='Bash'; tool_input=@{command='findstr KEY .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash sed 1p .env';                 Data=@{tool_name='Bash'; tool_input=@{command='sed 1p .env'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash source / dot-source: DENY ---
    @{ Name='ENV: Bash source .env';                 Data=@{tool_name='Bash'; tool_input=@{command='source .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash . .env.local';                Data=@{tool_name='Bash'; tool_input=@{command='. .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash . ./.env';                    Data=@{tool_name='Bash'; tool_input=@{command='. ./.env'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash copy / move / delete: DENY ---
    @{ Name='ENV: Bash cp .env /tmp/x';              Data=@{tool_name='Bash'; tool_input=@{command='cp .env /tmp/x'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cp x .env';                   Data=@{tool_name='Bash'; tool_input=@{command='cp foo.txt .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash mv .env x';                   Data=@{tool_name='Bash'; tool_input=@{command='mv .env new.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash rm .env';                     Data=@{tool_name='Bash'; tool_input=@{command='rm .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash del .env.local';              Data=@{tool_name='Bash'; tool_input=@{command='del .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash copy .env x';                 Data=@{tool_name='Bash'; tool_input=@{command='copy .env foo.txt'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash output redirection: DENY ---
    @{ Name='ENV: Bash echo > .env';                 Data=@{tool_name='Bash'; tool_input=@{command='echo foo > .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash echo >> .env.local';          Data=@{tool_name='Bash'; tool_input=@{command='echo bar >> .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash date > .env.production';      Data=@{tool_name='Bash'; tool_input=@{command='date > .env.production'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash git content-exposing subcommands: DENY ---
    @{ Name='ENV: Bash git show HEAD:.env';          Data=@{tool_name='Bash'; tool_input=@{command='git show HEAD:.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git show HEAD:.env.local';    Data=@{tool_name='Bash'; tool_input=@{command='git show HEAD:.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git diff -- .env';            Data=@{tool_name='Bash'; tool_input=@{command='git diff -- .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git diff .env.local';         Data=@{tool_name='Bash'; tool_input=@{command='git diff .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git blame .env';              Data=@{tool_name='Bash'; tool_input=@{command='git blame .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git cat-file blob HEAD:.env'; Data=@{tool_name='Bash'; tool_input=@{command='git cat-file blob HEAD:.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git log -p .env.local';       Data=@{tool_name='Bash'; tool_input=@{command='git log -p .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git grep KEY .env.local';     Data=@{tool_name='Bash'; tool_input=@{command='git grep KEY .env.local'}; cwd=$featCwd}; Exp='deny' },

    # --- PowerShell command form: DENY ---
    @{ Name='ENV: PS Get-Content .env';              Data=@{tool_name='PowerShell'; tool_input=@{command='Get-Content .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS Get-Content .env.local';        Data=@{tool_name='PowerShell'; tool_input=@{command='Get-Content .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS gc .env';                       Data=@{tool_name='PowerShell'; tool_input=@{command='gc .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS Set-Content .env foo';          Data=@{tool_name='PowerShell'; tool_input=@{command='Set-Content .env foo'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS Copy-Item .env x';              Data=@{tool_name='PowerShell'; tool_input=@{command='Copy-Item .env foo.txt'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS Remove-Item .env.local';        Data=@{tool_name='PowerShell'; tool_input=@{command='Remove-Item .env.local'}; cwd=$featCwd}; Exp='deny' },

    # --- Compound commands: DENY (pipe / && / ;) ---
    @{ Name='ENV: Bash cat .env | grep K';           Data=@{tool_name='Bash'; tool_input=@{command='cat .env | grep KEY'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash echo x && cat .env';          Data=@{tool_name='Bash'; tool_input=@{command='echo x && cat .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash echo x; cat .env.local';      Data=@{tool_name='Bash'; tool_input=@{command='echo x; cat .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash false || cat .env';           Data=@{tool_name='Bash'; tool_input=@{command='false || cat .env'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash / PS false-positive resistance (NO DECISION) ---
    @{ Name='ENV-OK: echo ".env" literal';           Data=@{tool_name='Bash'; tool_input=@{command='echo ".env"'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: echo about .env in text';       Data=@{tool_name='Bash'; tool_input=@{command='echo "The .env file is..."'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat .env.example';              Data=@{tool_name='Bash'; tool_input=@{command='cat .env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat foo.env';                   Data=@{tool_name='Bash'; tool_input=@{command='cat foo.env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat .envrc';                    Data=@{tool_name='Bash'; tool_input=@{command='cat .envrc'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat .environment';              Data=@{tool_name='Bash'; tool_input=@{command='cat .environment'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat dotenv.config.ts';          Data=@{tool_name='Bash'; tool_input=@{command='cat dotenv.config.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: grep .env README.md';           Data=@{tool_name='Bash'; tool_input=@{command='grep .env README.md'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat README.md';                 Data=@{tool_name='Bash'; tool_input=@{command='cat README.md'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: ls .env (metadata only)';       Data=@{tool_name='Bash'; tool_input=@{command='ls .env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: git log .env (no -p)';          Data=@{tool_name='Bash'; tool_input=@{command='git log .env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: git log --stat .env';           Data=@{tool_name='Bash'; tool_input=@{command='git log --stat .env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: git status';                    Data=@{tool_name='Bash'; tool_input=@{command='git status'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: PS Get-Content README.md';      Data=@{tool_name='PowerShell'; tool_input=@{command='Get-Content README.md'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cp .env.example .env.new';      Data=@{tool_name='Bash'; tool_input=@{command='cp .env.example configured.env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: git grep .env README.md';       Data=@{tool_name='Bash'; tool_input=@{command='git grep .env README.md'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: sed 1p README.md';              Data=@{tool_name='Bash'; tool_input=@{command='sed 1p README.md'}; cwd=$featCwd}; Exp='no-decision' },

    # ==================================================================
    # cwd spelling (independent review, 2026-09-15). Each group mirrors
    # plain-path cases above: how the cwd is spelled must not change the
    # verdict. Why= pins the rule, because a cwd git cannot resolve now
    # denies too, and these must not pass for that reason instead.
    # ==================================================================

    # --- Space plus trailing backslash: PS 5.1 quoting mangled `git -C` ---
    @{ Name='CWD: space+trailing\ main, Write';       Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd="$spMain\"}; Exp='deny'; Why="while on 'main'" },
    @{ Name='CWD: space+trailing\ main, git commit';  Data=@{tool_name='Bash'; tool_input=@{command='git commit -m x'}; cwd="$spMain\"}; Exp='deny'; Why="while on 'main'" },
    @{ Name='CWD: space+trailing\ ralph no prd, Write'; Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd="$spRalphNoPrd\"}; Exp='deny'; Why='prd.json is missing' },
    @{ Name='CWD: space+trailing\ feature, Write';    Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd="$spFeat\"}; Exp='no-decision' },
    @{ Name='CWD: space+trailing\ feature, git push'; Data=@{tool_name='Bash'; tool_input=@{command='git push'}; cwd="$spFeat\"}; Exp='ask' },

    # --- Non-ASCII cwd as raw UTF-8: stdin was decoded as IBM437 ---
    @{ Name='CWD: utf-8 main, Write';                 Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$acMain}; Exp='deny'; Why="while on 'main'"; Utf8=$true },
    @{ Name='CWD: utf-8 main, git commit';            Data=@{tool_name='Bash'; tool_input=@{command='git commit -m x'}; cwd=$acMain}; Exp='deny'; Why="while on 'main'"; Utf8=$true },
    @{ Name='CWD: utf-8 ralph no prd, Write';         Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$acRalphNoPrd}; Exp='deny'; Why='prd.json is missing'; Utf8=$true },
    @{ Name='CWD: utf-8 feature, Write';              Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$acFeat}; Exp='no-decision'; Utf8=$true },
    @{ Name='CWD: utf-8 feature, git push';           Data=@{tool_name='Bash'; tool_input=@{command='git push'}; cwd=$acFeat}; Exp='ask'; Utf8=$true },

    # --- \\localhost\C$ admin share: git refused it (safe.directory) ---
    @{ Name='CWD: unc main, Write';                   Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$uncSpMain}; Exp='deny'; Why="while on 'main'" },
    @{ Name='CWD: unc main, git commit';              Data=@{tool_name='Bash'; tool_input=@{command='git commit -m x'}; cwd=$uncSpMain}; Exp='deny'; Why="while on 'main'" },
    @{ Name='CWD: unc ralph no prd subdir, Write';    Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$uncSpRalphNoPrdSub}; Exp='deny'; Why='prd.json is missing' },
    @{ Name='CWD: unc feature, Write';                Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$uncSpFeat}; Exp='no-decision' },
    @{ Name='CWD: unc feature, git push';             Data=@{tool_name='Bash'; tool_input=@{command='git push'}; cwd=$uncSpFeat}; Exp='ask' },
    @{ Name='CWD: unc+utf-8+trailing\ main, Write';   Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$uncAcMainSlash}; Exp='deny'; Why="while on 'main'"; Utf8=$true },

    # --- Branch cannot be determined: fail closed, as on main ---
    # It may be main. Mutation is denied; inspection and leaving stay possible;
    # a shipping action is denied rather than prompted (forbidden beats
    # prompted, as on main); every existing deny keeps its own reason.
    @{ Name='UNRESOLVED: broken .git, Write';         Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoBrokenGit}; Exp='deny'; Why='cannot be determined' },
    @{ Name='UNRESOLVED: broken .git, Edit';          Data=@{tool_name='Edit';  tool_input=@{file_path='x'}; cwd=$repoBrokenGit}; Exp='deny'; Why='cannot be determined' },
    @{ Name='UNRESOLVED: broken .git, NotebookEdit';  Data=@{tool_name='NotebookEdit'; tool_input=@{notebook_path='x.ipynb'}; cwd=$repoBrokenGit}; Exp='deny'; Why='cannot be determined' },
    @{ Name='UNRESOLVED: broken .git, pnpm add';      Data=@{tool_name='Bash'; tool_input=@{command='pnpm add foo'}; cwd=$repoBrokenGit}; Exp='deny'; Why='cannot be determined' },
    @{ Name='UNRESOLVED: broken .git, git commit';    Data=@{tool_name='Bash'; tool_input=@{command='git commit -m x'}; cwd=$repoBrokenGit}; Exp='deny'; Why='cannot be determined' },
    @{ Name='UNRESOLVED: broken .git, git push';      Data=@{tool_name='Bash'; tool_input=@{command='git push'}; cwd=$repoBrokenGit}; Exp='deny'; Why='cannot be determined' },
    @{ Name='UNRESOLVED: broken .git, git status';    Data=@{tool_name='Bash'; tool_input=@{command='git status'}; cwd=$repoBrokenGit}; Exp='no-decision' },
    @{ Name='UNRESOLVED: broken .git, git switch -c'; Data=@{tool_name='Bash'; tool_input=@{command='git switch -c chore/x'}; cwd=$repoBrokenGit}; Exp='no-decision' },
    @{ Name='UNRESOLVED: broken .git, reset --hard';  Data=@{tool_name='Bash'; tool_input=@{command='git reset --hard'}; cwd=$repoBrokenGit}; Exp='deny'; Why='destructive Git command' },
    @{ Name='UNRESOLVED: broken .git, git add .';     Data=@{tool_name='Bash'; tool_input=@{command='git add .'}; cwd=$repoBrokenGit}; Exp='deny'; Why='unsafe git staging' },
    @{ Name='UNRESOLVED: broken .git, Read .env';     Data=@{tool_name='Read'; tool_input=@{file_path='.env'}; cwd=$repoBrokenGit}; Exp='deny'; Why='protected .env file' },
    @{ Name='UNRESOLVED: broken .git, Read file';     Data=@{tool_name='Read'; tool_input=@{file_path='x'}; cwd=$repoBrokenGit}; Exp='no-decision' },
    @{ Name='UNRESOLVED: missing cwd, Write';         Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$cwdMissing}; Exp='deny'; Why='cannot be determined' },
    # The reason quotes the non-ASCII cwd; the reply must still be valid UTF-8.
    @{ Name='UNRESOLVED: missing utf-8 cwd, Write';   Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$cwdMissingAccent}; Exp='deny'; Why='cannot be determined'; Utf8=$true },
    @{ Name='UNRESOLVED: no cwd, Write';              Data=@{tool_name='Write'; tool_input=@{file_path='x'}}; Exp='deny'; Why='no cwd' },
    @{ Name='UNRESOLVED: no cwd, Read file';          Data=@{tool_name='Read'; tool_input=@{file_path='x'}}; Exp='no-decision' },

    # --- Outside any repository nothing changes ---
    @{ Name='NOREPO: plain directory, Write';         Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$dirNoRepo}; Exp='no-decision' },
    @{ Name='NOREPO: plain directory, pnpm add';      Data=@{tool_name='Bash'; tool_input=@{command='pnpm add foo'}; cwd=$dirNoRepo}; Exp='no-decision' },

    # --- A junction cwd resolves to the real work tree ---
    # git answers for the junction's target, so the contract at that repository's
    # root must be found. Joining git's relative '../' answer onto the junction
    # path climbed above the root and denied this as "prd.json is missing".
    @{ Name='CWD: junction into ralph repo, Write';   Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$junctionRalph}; Exp='no-decision' },
    @{ Name='CWD: junction into main repo, Write';    Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$junctionMain}; Exp='deny'; Why="while on 'main'" },

    # --- Unborn branch ---
    @{ Name='UNBORN: main, Write';                    Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoUnbornMain}; Exp='deny'; Why="while on 'main'" },
    @{ Name='UNBORN: main, git add file';             Data=@{tool_name='Bash'; tool_input=@{command='git add src/x'}; cwd=$repoUnbornMain}; Exp='deny'; Why="while on 'main'" },
    @{ Name='UNBORN: feature, Write';                 Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoUnbornFeat}; Exp='no-decision' }
)

foreach ($f in $fixtures) {
    Invoke-Fixture -Name $f.Name -InputData $f.Data -Expected $f.Exp -ReasonLike $f.Why -Utf8:([bool]$f.Utf8)
}

# Print results
$pass = ($results | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
foreach ($r in $results) {
    "{0,-55} decision={1,-12} expected={2,-12} {3}" -f $r.Name, $r.Decision, $r.Expected, $r.Status
}
""
"TOTAL: $($results.Count)  PASS: $pass  FAIL: $fail"

# Cleanup ephemeral repos. The junctions are unlinked first: Remove-Item
# -Recurse follows one on PS 5.1 and would delete through it.
foreach ($jn in @($junctionRalph, $junctionMain)) {
    if ([System.IO.Directory]::Exists($jn)) { [System.IO.Directory]::Delete($jn) }
}
Remove-Item -Recurse -Force $root
"Cleanup: removed $root"
